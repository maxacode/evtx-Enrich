// =============================================================================
// csv_exporter.rs — CSV Export Logic
//
// This module converts a slice of EventRecord structs into a CSV file on disk.
//
// COLUMN LAYOUT:
//   Fixed columns (always present, in a defined order):
//     timestamp, event_id, level, channel, computer, username, domain,
//     target_username, target_domain, process_id, process_name, ip_address,
//     port, logon_type, command_line, parent_process, workstation, auth_package
//
//   Dynamic columns (appended after fixed columns):
//     All unique keys found in `extra_fields` across ALL records, sorted
//     alphabetically. This means every CSV file produced from the same set of
//     event types will have a consistent column order even if not every record
//     has a value for every extra field.
//
// BEHAVIOUR:
//   - None values are written as empty strings (not "null" or "None").
//   - The csv crate handles quoting/escaping of commas, quotes, and newlines
//     inside field values automatically.
//   - The output path is created if the parent directory already exists; if the
//     parent directory does not exist the OS will return an error that we
//     surface as a descriptive Err(String).
//   - Writing is done record-by-record (streaming) so large exports don't
//     require holding two copies of all data in memory simultaneously.
// =============================================================================

use std::collections::BTreeSet;

use crate::types::EventRecord;

/// Write `records` to a CSV file at `output_path`.
///
/// Returns `Ok(())` on success or `Err(String)` with a human-readable message
/// if the file cannot be created or written to.
pub fn export_to_csv(records: &[EventRecord], output_path: &str) -> Result<(), String> {
    // Ensure parent directories exist
    if let Some(parent) = std::path::Path::new(output_path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory for '{}': {}", output_path, e))?;
        }
    }

    // Create (or overwrite) the output file. csv::Writer handles buffered I/O
    // internally so we don't need to wrap it in a BufWriter.
    let mut writer = csv::Writer::from_path(output_path)
        .map_err(|e| format!("Failed to create CSV file at '{}': {}", output_path, e))?;

    // -----------------------------------------------------------------------
    // Collect all unique extra_field keys across every record.
    //
    // We use a BTreeSet (sorted set) so that:
    //   a) The dynamic column order is deterministic across runs.
    //   b) The sort is alphabetical, which is the most user-friendly ordering
    //      when analysts open the CSV in Excel or a similar tool.
    //
    // This requires a single pass over all records before we start writing.
    // For typical IR file sizes (thousands to tens of thousands of records)
    // this is negligible overhead compared to I/O.
    // -----------------------------------------------------------------------
    let mut extra_keys: BTreeSet<String> = BTreeSet::new();
    for record in records {
        for key in record.extra_fields.keys() {
            extra_keys.insert(key.clone());
        }
    }

    // Convert to a Vec so we can index into it when writing rows.
    let extra_keys_vec: Vec<String> = extra_keys.into_iter().collect();

    // -----------------------------------------------------------------------
    // Write the header row
    //
    // Fixed column names first (matching the documented API contract order),
    // then the dynamically discovered extra field columns.
    // -----------------------------------------------------------------------

    // Build the header as a Vec<&str> — csv::Writer::write_record accepts any
    // iterable of AsRef<[u8]>, so &str works fine here.
    let fixed_header: Vec<&str> = vec![
        "timestamp", "event_id", "level", "channel", "computer", "username", "domain",
        "target_username", "target_domain", "process_id", "process_name", "ip_address",
        "port", "logon_type", "command_line", "parent_process", "workstation", "auth_package",
    ];

    // Determine which columns have at least one value across all records
    let mut active_fixed: Vec<bool> = vec![false; fixed_header.len()];
    let mut active_extra: Vec<bool> = vec![false; extra_keys_vec.len()];

    for record in records {
        // Check fixed fields
        let opt_check = |opt: &Option<String>| -> bool { opt.as_ref().map(|s| !s.is_empty()).unwrap_or(false) };
        if !record.timestamp.is_empty() { active_fixed[0] = true; }
        active_fixed[1] = true; // event_id
        if !record.level.is_empty() { active_fixed[2] = true; }
        if !record.channel.is_empty() { active_fixed[3] = true; }
        if !record.computer.is_empty() { active_fixed[4] = true; }
        if opt_check(&record.username) { active_fixed[5] = true; }
        if opt_check(&record.domain) { active_fixed[6] = true; }
        if opt_check(&record.target_username) { active_fixed[7] = true; }
        if opt_check(&record.target_domain) { active_fixed[8] = true; }
        if opt_check(&record.process_id) { active_fixed[9] = true; }
        if opt_check(&record.process_name) { active_fixed[10] = true; }
        if opt_check(&record.ip_address) { active_fixed[11] = true; }
        if opt_check(&record.port) { active_fixed[12] = true; }
        if opt_check(&record.logon_type) { active_fixed[13] = true; }
        if opt_check(&record.command_line) { active_fixed[14] = true; }
        if opt_check(&record.parent_process) { active_fixed[15] = true; }
        if opt_check(&record.workstation) { active_fixed[16] = true; }
        if opt_check(&record.auth_package) { active_fixed[17] = true; }

        // Check extra fields
        for (i, key) in extra_keys_vec.iter().enumerate() {
            if let Some(val) = record.extra_fields.get(key) {
                if !val.is_empty() && val != "-" && val != "0x0" {
                    active_extra[i] = true;
                }
            }
        }
    }

    // Build the final header by filtering out inactive columns
    let mut final_header: Vec<String> = Vec::new();
    for (i, &active) in active_fixed.iter().enumerate() {
        if active { final_header.push(fixed_header[i].to_string()); }
    }
    for (i, &active) in active_extra.iter().enumerate() {
        if active { final_header.push(extra_keys_vec[i].clone()); }
    }

    writer
        .write_record(&final_header)
        .map_err(|e| format!("Failed to write CSV header: {}", e))?;

    // -----------------------------------------------------------------------
    // Write data rows
    // -----------------------------------------------------------------------
    for record in records {
        let opt_str = |opt: &Option<String>| -> String { opt.as_deref().unwrap_or("").to_string() };
        let mut row: Vec<String> = Vec::new();

        // Fixed fields (only if active)
        if active_fixed[0] { row.push(record.timestamp.clone()); }
        if active_fixed[1] { row.push(record.event_id.to_string()); }
        if active_fixed[2] { row.push(record.level.clone()); }
        if active_fixed[3] { row.push(record.channel.clone()); }
        if active_fixed[4] { row.push(record.computer.clone()); }
        if active_fixed[5] { row.push(opt_str(&record.username)); }
        if active_fixed[6] { row.push(opt_str(&record.domain)); }
        if active_fixed[7] { row.push(opt_str(&record.target_username)); }
        if active_fixed[8] { row.push(opt_str(&record.target_domain)); }
        if active_fixed[9] { row.push(opt_str(&record.process_id)); }
        if active_fixed[10] { row.push(opt_str(&record.process_name)); }
        if active_fixed[11] { row.push(opt_str(&record.ip_address)); }
        if active_fixed[12] { row.push(opt_str(&record.port)); }
        if active_fixed[13] { row.push(opt_str(&record.logon_type)); }
        if active_fixed[14] { row.push(opt_str(&record.command_line)); }
        if active_fixed[15] { row.push(opt_str(&record.parent_process)); }
        if active_fixed[16] { row.push(opt_str(&record.workstation)); }
        if active_fixed[17] { row.push(opt_str(&record.auth_package)); }

        // Extra fields (only if active)
        for (i, key) in extra_keys_vec.iter().enumerate() {
            if active_extra[i] {
                row.push(record.extra_fields.get(key).cloned().unwrap_or_default());
            }
        }

        writer
            .write_record(&row)
            .map_err(|e| format!("Failed to write CSV row: {}", e))?;
    }

    // Flush the internal write buffer to disk. Without this, the last few rows
    // may be lost if the program exits before the buffer is auto-flushed.
    writer
        .flush()
        .map_err(|e| format!("Failed to flush CSV writer: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::fs;
    use std::env;

    fn create_mock_record() -> EventRecord {
        EventRecord {
            timestamp: "2024-01-01T12:00:00Z".to_string(),
            event_id: 4624,
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
            target_username: None,
            target_domain: None,
            workstation: None,
            auth_package: None,
            extra_fields: HashMap::new(),
        }
    }

    #[test]
    fn test_export_to_csv_basic() {
        let mut r1 = create_mock_record();
        r1.extra_fields.insert("CustomField".to_string(), "Value1".to_string());
        
        let records = vec![r1];
        let tmp_dir = env::temp_dir();
        let file_path = tmp_dir.join("test_export.csv");
        let path_str = file_path.to_str().unwrap();

        let result = export_to_csv(&records, path_str);
        assert!(result.is_ok());

        let contents = fs::read_to_string(path_str).unwrap();
        let lines: Vec<&str> = contents.lines().collect();
        
        // Header + 1 record
        assert_eq!(lines.len(), 2);
        
        // Check if header contains our custom field
        assert!(lines[0].contains("CustomField"));
        // Check if record contains our value
        assert!(lines[1].contains("Value1"));

        let _ = fs::remove_file(file_path);
    }

    #[test]
    fn test_csv_escaping() {
        let mut r1 = create_mock_record();
        r1.username = Some("User, with comma".to_string());
        r1.process_name = Some("Process \"with quotes\"".to_string());
        r1.extra_fields.insert("Multiline".to_string(), "Line 1\nLine 2".to_string());

        let records = vec![r1];
        let tmp_dir = env::temp_dir();
        let file_path = tmp_dir.join("test_escape.csv");
        let path_str = file_path.to_str().unwrap();

        export_to_csv(&records, path_str).unwrap();

        let contents = fs::read_to_string(path_str).unwrap();
        
        // csv crate should wrap fields with commas/quotes in double quotes
        assert!(contents.contains("\"User, with comma\""));
        assert!(contents.contains("\"Process \"\"with quotes\"\"\""));
        assert!(contents.contains("\"Line 1\nLine 2\""));

        let _ = fs::remove_file(file_path);
    }

    #[test]
    fn test_inactive_columns_filtered() {
        let r1 = create_mock_record();
        // r1 has most fields as None or empty, except timestamp, event_id, etc.
        
        let records = vec![r1];
        let tmp_dir = env::temp_dir();
        let file_path = tmp_dir.join("test_inactive.csv");
        let path_str = file_path.to_str().unwrap();

        export_to_csv(&records, path_str).unwrap();

        let contents = fs::read_to_string(path_str).unwrap();
        let header = contents.lines().next().unwrap();
        
        // target_username should be inactive and thus not in header
        assert!(!header.contains("target_username"));
        // timestamp should be active
        assert!(header.contains("timestamp"));

        let _ = fs::remove_file(file_path);
    }

    #[test]
    fn test_export_to_csv_creates_directories() {
        let records = vec![create_mock_record()];
        let tmp_dir = env::temp_dir();
        // Create a nested path that doesn't exist
        let nested_path = tmp_dir.join("nonexistent_subdir").join("nested_test.csv");
        let path_str = nested_path.to_str().unwrap();

        // Ensure the parent directory doesn't exist before we run the test
        if nested_path.parent().unwrap().exists() {
            let _ = fs::remove_dir_all(nested_path.parent().unwrap());
        }

        let result = export_to_csv(&records, path_str);
        assert!(result.is_ok());

        assert!(nested_path.exists());

        let _ = fs::remove_file(&nested_path);
        let _ = fs::remove_dir(nested_path.parent().unwrap());
    }

    #[test]
    fn test_export_to_csv_invalid_path() {
        let records = vec![create_mock_record()];
        // An empty string or a path that's literally impossible (e.g., trying to write into a file as if it were a directory)
        let path_str = "/nonexistent_root_dir/some_file.csv"; // Typically fails on non-root users

        let result = export_to_csv(&records, path_str);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to"));
    }
}
