// =============================================================================
// filters.rs — Event Record Filtering Logic
//
// This module exposes a single public function, `apply_filters`, which accepts
// a list of parsed EventRecords and a FilterConfig and returns only the records
// that satisfy every active (non-None) filter criterion.
//
// Filter application follows an "AND" model: every filter that is set must
// pass for a record to be retained. If no filters are set at all, all records
// are returned unchanged.
//
// Time Filtering (mutually exclusive, relative takes priority):
//   - relative_days : computes a cutoff = Utc::now() - N days; keeps records
//                     whose timestamp >= that cutoff.
//   - date_from     : keeps records with timestamp >= parsed ISO 8601 date.
//   - date_to       : keeps records with timestamp <= parsed ISO 8601 date.
//
// Text Filtering (all case-insensitive partial matches):
//   - hostname       : matched against EventRecord.computer
//   - process_id     : matched against EventRecord.process_id
//   - ip_address     : matched against EventRecord.ip_address
//   - username       : matched against EventRecord.username OR target_username
//   - custom_field_name / custom_field_value : matched against extra_fields map
//
// Error handling: invalid date strings are treated as non-matching (the record
// is dropped), which is the safest behaviour — a bad filter should not silently
// let everything through.
// =============================================================================

use chrono::{DateTime, Duration, Utc};

use crate::types::{EventRecord, FilterConfig};

fn contains_case_insensitive(haystack: &str, needle_lower: &str) -> bool {
    haystack.to_lowercase().contains(needle_lower)
}

fn record_matches_keyword(record: &EventRecord, keyword_lower: &str) -> bool {
    if keyword_lower.is_empty() {
        return true;
    }

    // System + known fields
    if contains_case_insensitive(&record.timestamp, keyword_lower) { return true; }
    if contains_case_insensitive(&record.event_id.to_string(), keyword_lower) { return true; }
    if contains_case_insensitive(&record.level, keyword_lower) { return true; }
    if contains_case_insensitive(&record.channel, keyword_lower) { return true; }
    if contains_case_insensitive(&record.computer, keyword_lower) { return true; }

    let check_opt = |opt: &Option<String>| -> bool {
        opt.as_deref()
            .map(|s| contains_case_insensitive(s, keyword_lower))
            .unwrap_or(false)
    };

    if check_opt(&record.username) { return true; }
    if check_opt(&record.domain) { return true; }
    if check_opt(&record.process_id) { return true; }
    if check_opt(&record.process_name) { return true; }
    if check_opt(&record.ip_address) { return true; }
    if check_opt(&record.port) { return true; }
    if check_opt(&record.logon_type) { return true; }
    if check_opt(&record.command_line) { return true; }
    if check_opt(&record.parent_process) { return true; }
    if check_opt(&record.target_username) { return true; }
    if check_opt(&record.target_domain) { return true; }
    if check_opt(&record.workstation) { return true; }
    if check_opt(&record.auth_package) { return true; }

    // Extra fields (keys and values)
    for (k, v) in &record.extra_fields {
        if contains_case_insensitive(k, keyword_lower) { return true; }
        if contains_case_insensitive(v, keyword_lower) { return true; }
    }

    false
}

/// Apply all active filters from `filters` to `records`, returning only those
/// records that match every filter that is set. Consumes `records` and returns
/// a new filtered Vec (avoiding in-place mutation, which would complicate
/// ownership when the caller holds references to individual records).
pub fn apply_filters(records: Vec<EventRecord>, filters: &FilterConfig) -> Vec<EventRecord> {
    // ------------------------------------------------------------------
    // Pre-compute the time bounds once, outside the per-record loop, so
    // we avoid re-parsing / re-computing timestamps for every single record.
    // ------------------------------------------------------------------

    // Determine the effective `date_from` boundary.
    // `relative_days` takes precedence over an explicit `date_from` string.
    let effective_date_from: Option<DateTime<Utc>> = if let Some(days) = filters.relative_days {
        // Relative mode: subtract `days` from the current UTC time.
        // Duration::days accepts i64, so we cast the u32 safely.
        Some(Utc::now() - Duration::days(days as i64))
    } else if let Some(ref from_str) = filters.date_from {
        // Absolute mode: parse the ISO 8601 string supplied by the frontend.
        // If the string is malformed, log a warning and use None (no lower bound).
        match from_str.parse::<DateTime<Utc>>() {
            Ok(dt) => Some(dt),
            Err(e) => {
                // A bad date filter is a user error; log it but don't crash.
                eprintln!("[filters] Could not parse date_from '{}': {}", from_str, e);
                None
            }
        }
    } else {
        // No time lower bound requested.
        None
    };

    // Determine the effective `date_to` boundary.
    // Only used when `relative_days` is NOT set (relative_days implies open-ended upper bound).
    let effective_date_to: Option<DateTime<Utc>> = if filters.relative_days.is_some() {
        // When using relative mode we don't apply an upper bound — everything
        // from the cutoff to "now" should be included.
        None
    } else if let Some(ref to_str) = filters.date_to {
        match to_str.parse::<DateTime<Utc>>() {
            Ok(dt) => Some(dt),
            Err(e) => {
                eprintln!("[filters] Could not parse date_to '{}': {}", to_str, e);
                None
            }
        }
    } else {
        None
    };

    // ------------------------------------------------------------------
    // Filter the records.
    // `.into_iter().filter().collect()` is idiomatic Rust for this pattern.
    // We use a closure that returns `bool`; all conditions must be true.
    // ------------------------------------------------------------------
    let mut filtered: Vec<EventRecord> = records
        .into_iter()
        .filter(|record| {
            // ---- Time lower-bound check --------------------------------
            if let Some(from_dt) = effective_date_from {
                // Parse the record's own timestamp. Records with unparseable
                // timestamps are conservatively dropped (return false).
                match record.timestamp.parse::<DateTime<Utc>>() {
                    Ok(rec_dt) if rec_dt >= from_dt => {} // passes this check
                    Ok(_) => return false,                // before cutoff — exclude
                    Err(_) => return false,               // unparseable — exclude
                }
            }

            // ---- Time upper-bound check --------------------------------
            if let Some(to_dt) = effective_date_to {
                match record.timestamp.parse::<DateTime<Utc>>() {
                    Ok(rec_dt) if rec_dt <= to_dt => {} // passes this check
                    Ok(_) => return false,              // after cutoff — exclude
                    Err(_) => return false,             // unparseable — exclude
                }
            }

            // ---- Hostname / computer filter ----------------------------
            // Case-insensitive partial match: the record's computer field must
            // contain the filter string somewhere in it.
            if let Some(ref hostname_filter) = filters.hostname {
                let hostname_lower = hostname_filter.to_lowercase();
                if !record.computer.to_lowercase().contains(&hostname_lower) {
                    return false;
                }
            }

            // ---- Process ID filter -------------------------------------
            // Partial match: useful when the analyst only knows part of a PID
            // or wants to match a range by prefix (less common but supported).
            if let Some(ref pid_filter) = filters.process_id {
                match &record.process_id {
                    Some(pid) if pid.contains(pid_filter.as_str()) => {} // passes
                    _ => return false, // field absent or no match
                }
            }

            // ---- IP address filter -------------------------------------
            // Partial match against the ip_address field. Useful for subnet
            // searches like "192.168.1." matching all hosts in that subnet.
            if let Some(ref ip_filter) = filters.ip_address {
                match &record.ip_address {
                    Some(ip) if ip.contains(ip_filter.as_str()) => {} // passes
                    _ => return false, // field absent or no match
                }
            }

            // ---- Username filter ----------------------------------------
            // Case-insensitive partial match against EITHER the subject username
            // (SubjectUserName) OR the target username (TargetUserName), because
            // analysts often don't know which side of a logon event they care
            // about. If either matches, the record is kept.
            if let Some(ref user_filter) = filters.username {
                let user_lower = user_filter.to_lowercase();

                // Check the subject username field
                let username_match = record
                    .username
                    .as_deref()
                    .map(|u| u.to_lowercase().contains(&user_lower))
                    .unwrap_or(false);

                // Check the target username field
                let target_match = record
                    .target_username
                    .as_deref()
                    .map(|u| u.to_lowercase().contains(&user_lower))
                    .unwrap_or(false);

                // Exclude the record only if neither field matched
                if !username_match && !target_match {
                    return false;
                }
            }

            // ---- Custom field filter ------------------------------------
            // Allows filtering on any arbitrary EventData field not covered
            // by the named struct fields (stored in extra_fields).
            //
            // Two sub-cases:
            //   a) name + value → keep records where extra_fields[name] contains value
            //   b) name only    → keep records where the key exists at all
            if let Some(ref field_name) = filters.custom_field_name {
                match filters.custom_field_value.as_deref() {
                    Some(field_value) => {
                        // Sub-case (a): must have the key AND value must contain the filter
                        let value_lower = field_value.to_lowercase();
                        match record.extra_fields.get(field_name.as_str()) {
                            Some(v) if v.to_lowercase().contains(&value_lower) => {} // passes
                            _ => return false, // key absent or value doesn't match
                        }
                    }
                    None => {
                        // Sub-case (b): just check that the key exists in extra_fields
                        if !record.extra_fields.contains_key(field_name.as_str()) {
                            return false;
                        }
                    }
                }
            }

            // All active filters passed — include this record in the output
            true
        })
        .collect();

    // ------------------------------------------------------------------
    // Keyword search with optional context window
    // ------------------------------------------------------------------
    let keyword = filters
        .keyword
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());

    if let Some(keyword) = keyword {
        let keyword_lower = keyword.to_lowercase();
        let ctx = filters.keyword_context.unwrap_or(0).min(5) as usize;

        let mut include: Vec<bool> = vec![false; filtered.len()];

        for (i, record) in filtered.iter().enumerate() {
            if record_matches_keyword(record, &keyword_lower) {
                let start = i.saturating_sub(ctx);
                let end = (i + ctx).min(filtered.len().saturating_sub(1));
                for j in start..=end {
                    include[j] = true;
                }
            }
        }

        filtered = filtered
            .into_iter()
            .enumerate()
            .filter(|(i, _)| include[*i])
            .map(|(_, r)| r)
            .collect();
    }

    filtered
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn create_mock_record(id: u32, timestamp: &str) -> EventRecord {
        EventRecord {
            timestamp: timestamp.to_string(),
            event_id: id,
            level: "Information".to_string(),
            channel: "Security".to_string(),
            computer: "DESKTOP-ABC".to_string(),
            username: Some("alice".to_string()),
            domain: Some("WORKGROUP".to_string()),
            process_id: Some("1234".to_string()),
            process_name: Some("explorer.exe".to_string()),
            ip_address: Some("192.168.1.10".to_string()),
            port: Some("443".to_string()),
            logon_type: Some("2".to_string()),
            command_line: None,
            parent_process: None,
            target_username: Some("bob".to_string()),
            target_domain: None,
            workstation: None,
            auth_package: None,
            extra_fields: HashMap::new(),
        }
    }

    #[test]
    fn test_contains_case_insensitive() {
        assert!(contains_case_insensitive("Hello World", "hello"));
        assert!(contains_case_insensitive("Hello World", "world"));
        assert!(!contains_case_insensitive("Hello World", "earth"));
    }

    #[test]
    fn test_record_matches_keyword() {
        let mut r = create_mock_record(4624, "2024-01-01T12:00:00Z");
        assert!(record_matches_keyword(&r, "alice"));
        assert!(record_matches_keyword(&r, "desktop"));
        assert!(record_matches_keyword(&r, "4624"));
        
        r.extra_fields.insert("CustomKey".to_string(), "SpecialValue".to_string());
        assert!(record_matches_keyword(&r, "special"));
        assert!(record_matches_keyword(&r, "customkey"));
        
        assert!(!record_matches_keyword(&r, "nonexistent"));
    }

    #[test]
    fn test_apply_filters_empty() {
        let records = vec![create_mock_record(4624, "2024-01-01T12:00:00Z")];
        let filters = FilterConfig::default();
        let result = apply_filters(records.clone(), &filters);
        assert_eq!(result.len(), 1);
    }

    #[test]
    fn test_filter_by_hostname() {
        let records = vec![
            create_mock_record(1, "2024-01-01T12:00:00Z"),
            {
                let mut r = create_mock_record(2, "2024-01-01T12:00:00Z");
                r.computer = "SERVER-XYZ".to_string();
                r
            },
        ];
        let mut filters = FilterConfig::default();
        filters.hostname = Some("server".to_string());
        let result = apply_filters(records, &filters);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].computer, "SERVER-XYZ");
    }

    #[test]
    fn test_filter_by_username() {
        let records = vec![
            create_mock_record(1, "2024-01-01T12:00:00Z"), // alice, target bob
            {
                let mut r = create_mock_record(2, "2024-01-01T12:00:00Z");
                r.username = Some("charlie".to_string());
                r.target_username = None;
                r
            },
        ];
        
        // Match subject username
        let mut filters = FilterConfig::default();
        filters.username = Some("alice".to_string());
        assert_eq!(apply_filters(records.clone(), &filters).len(), 1);

        // Match target username
        filters.username = Some("bob".to_string());
        assert_eq!(apply_filters(records.clone(), &filters).len(), 1);

        // No match
        filters.username = Some("dave".to_string());
        assert_eq!(apply_filters(records.clone(), &filters).len(), 0);
    }

    #[test]
    fn test_filter_by_time_range() {
        let records = vec![
            create_mock_record(1, "2024-01-01T10:00:00Z"),
            create_mock_record(2, "2024-01-01T12:00:00Z"),
            create_mock_record(3, "2024-01-01T14:00:00Z"),
        ];

        let mut filters = FilterConfig::default();
        filters.date_from = Some("2024-01-01T11:00:00Z".to_string());
        filters.date_to = Some("2024-01-01T13:00:00Z".to_string());
        
        let result = apply_filters(records, &filters);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].event_id, 2);
    }

    #[test]
    fn test_filter_by_pid_and_ip() {
        let mut r1 = create_mock_record(1, "2024-01-01T12:00:00Z");
        r1.process_id = Some("1000".to_string());
        r1.ip_address = Some("10.0.0.1".to_string());

        let mut r2 = create_mock_record(2, "2024-01-01T12:00:00Z");
        r2.process_id = Some("2000".to_string());
        r2.ip_address = Some("192.168.1.1".to_string());

        let records = vec![r1, r2];

        let mut filters = FilterConfig::default();
        filters.process_id = Some("10".to_string()); // partial match
        filters.ip_address = Some("10.0".to_string());
        
        let result = apply_filters(records, &filters);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].event_id, 1);
    }

    #[test]
    fn test_filter_custom_field() {
        let mut r1 = create_mock_record(1, "2024-01-01T12:00:00Z");
        r1.extra_fields.insert("SubStatus".to_string(), "0xc000006d".to_string());

        let records = vec![r1, create_mock_record(2, "2024-01-01T12:00:00Z")];

        // Match by key existence
        let mut filters = FilterConfig::default();
        filters.custom_field_name = Some("SubStatus".to_string());
        assert_eq!(apply_filters(records.clone(), &filters).len(), 1);

        // Match by key and value
        filters.custom_field_value = Some("0x".to_string());
        assert_eq!(apply_filters(records.clone(), &filters).len(), 1);

        // No match by value
        filters.custom_field_value = Some("0xf".to_string());
        assert_eq!(apply_filters(records.clone(), &filters).len(), 0);
    }

    #[test]
    fn test_keyword_search_with_context() {
        let records = vec![
            create_mock_record(1, "2024-01-01T12:00:01Z"),
            create_mock_record(2, "2024-01-01T12:00:02Z"),
            {
                let mut r = create_mock_record(3, "2024-01-01T12:00:03Z");
                r.computer = "TARGET-PC".to_string();
                r
            },
            create_mock_record(4, "2024-01-01T12:00:04Z"),
            create_mock_record(5, "2024-01-01T12:00:05Z"),
        ];

        let mut filters = FilterConfig::default();
        filters.keyword = Some("TARGET".to_string());
        filters.keyword_context = Some(1);

        let result = apply_filters(records, &filters);
        // Should include record 3 and its neighbours 2 and 4.
        assert_eq!(result.len(), 3);
        assert_eq!(result[0].event_id, 2);
        assert_eq!(result[1].event_id, 3);
        assert_eq!(result[2].event_id, 4);
    }

    #[test]
    fn test_relative_days_calculation() {
        let now = Utc::now();
        // Use RFC3339 which is a subset of ISO 8601 and compatible with the parser
        let records = vec![
            create_mock_record(1, &(now - Duration::hours(1)).to_rfc3339()),  // 1 hour ago
            create_mock_record(2, &(now - Duration::days(5)).to_rfc3339()),   // 5 days ago
            create_mock_record(3, &(now - Duration::days(10)).to_rfc3339()),  // 10 days ago
        ];

        let mut filters = FilterConfig::default();
        filters.relative_days = Some(7); // Last 7 days

        let result = apply_filters(records, &filters);
        // Should include records 1 and 2, but not 3.
        assert_eq!(result.len(), 2);
        assert!(result.iter().any(|r| r.event_id == 1));
        assert!(result.iter().any(|r| r.event_id == 2));
        assert!(!result.iter().any(|r| r.event_id == 3));
    }
}
