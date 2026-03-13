use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Frontmatter {
    pub tags: Vec<String>,
    pub properties: BTreeMap<String, serde_yml::Value>,
}

pub fn extract_frontmatter(markdown: &str) -> Frontmatter {
    let mut frontmatter = Frontmatter::default();

    if !markdown.starts_with("---") {
        return frontmatter;
    }

    let Some(first_newline) = markdown.find('\n') else {
        return frontmatter;
    };
    
    let first_line = markdown[..first_newline].trim();
    if first_line != "---" {
        return frontmatter;
    }

    // Look for the end of the frontmatter
    let Some(end_index) = markdown[first_newline + 1..].find("\n---") else {
        return frontmatter;
    };

    let yaml_str = &markdown[first_newline + 1..first_newline + 1 + end_index];
    let Ok(value): Result<serde_yml::Value, _> = serde_yml::from_str(yaml_str) else {
        return frontmatter;
    };

    if let Some(map) = value.as_mapping() {
        for (k, v) in map {
            let Some(key) = k.as_str() else {
                continue;
            };

            if key == "tags" || key == "tag" {
                if let Some(tags) = v.as_sequence() {
                    for tag in tags {
                        if let Some(tag_str) = tag.as_str() {
                            frontmatter.tags.push(tag_str.to_string());
                        }
                    }
                } else if let Some(tag_str) = v.as_str() {
                    frontmatter.tags.push(tag_str.to_string());
                } else if let Some(tag_num) = v.as_u64() {
                    frontmatter.tags.push(tag_num.to_string());
                }
            } else {
                frontmatter.properties.insert(key.to_string(), v.clone());
            }
        }
    }

    frontmatter
}
