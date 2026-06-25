use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    pub cat_type: String,
    pub is_system: bool,
    pub sort_order: i32,
    pub archived_at: Option<String>,
    pub children: Vec<Category>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryFlat {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    pub cat_type: String,
    pub is_system: bool,
    pub sort_order: i32,
    pub archived_at: Option<String>,
}

fn row_to_flat(row: &rusqlite::Row<'_>) -> rusqlite::Result<CategoryFlat> {
    Ok(CategoryFlat {
        id: row.get(0)?,
        parent_id: row.get(1)?,
        name: row.get(2)?,
        cat_type: row.get(3)?,
        is_system: row.get::<_, i64>(4)? != 0,
        sort_order: row.get(5)?,
        archived_at: row.get(6)?,
    })
}

pub fn list_flat(conn: &Connection) -> Result<Vec<CategoryFlat>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, parent_id, name, type, is_system, sort_order, archived_at
             FROM categories
             WHERE archived_at IS NULL
             ORDER BY sort_order, name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], row_to_flat)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

pub fn list_tree(conn: &Connection) -> Result<Vec<Category>, String> {
    let flat = list_flat(conn)?;
    Ok(build_tree(&flat, None))
}

fn build_tree(flat: &[CategoryFlat], parent_id: Option<i64>) -> Vec<Category> {
    flat.iter()
        .filter(|c| c.parent_id == parent_id)
        .map(|c| Category {
            id: c.id,
            parent_id: c.parent_id,
            name: c.name.clone(),
            cat_type: c.cat_type.clone(),
            is_system: c.is_system,
            sort_order: c.sort_order,
            archived_at: c.archived_at.clone(),
            children: build_tree(flat, Some(c.id)),
        })
        .collect()
}

pub fn get_leaves(conn: &Connection) -> Result<Vec<CategoryFlat>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.parent_id, c.name, c.type, c.is_system, c.sort_order, c.archived_at
             FROM categories c
             WHERE c.archived_at IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM categories child
                   WHERE child.parent_id = c.id AND child.archived_at IS NULL
               )
             ORDER BY c.sort_order, c.name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], row_to_flat)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

pub fn get_by_id(conn: &Connection, id: i64) -> Result<Option<CategoryFlat>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, parent_id, name, type, is_system, sort_order, archived_at
             FROM categories WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    stmt.query_row([id], row_to_flat)
        .optional()
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct CreateCategoryInput {
    pub name: String,
    pub parent_id: Option<i64>,
    pub cat_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCategoryInput {
    pub id: i64,
    pub name: String,
}

pub fn create(conn: &Connection, input: &CreateCategoryInput) -> Result<CategoryFlat, String> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err("Category name is required".to_string());
    }

    let cat_type = if let Some(parent_id) = input.parent_id {
        let parent = get_by_id(conn, parent_id)?
            .ok_or_else(|| format!("Parent category {parent_id} not found"))?;
        if parent.archived_at.is_some() {
            return Err("Cannot add a category under an archived group".to_string());
        }
        parent.cat_type
    } else {
        let cat_type = input
            .cat_type
            .as_deref()
            .ok_or_else(|| "Category type is required for top-level groups".to_string())?;
        validate_cat_type(cat_type)?;
        cat_type.to_string()
    };

    let sort_order = next_sort_order(conn, input.parent_id)?;

    conn.execute(
        "INSERT INTO categories (parent_id, name, type, is_system, sort_order)
         VALUES (?1, ?2, ?3, 0, ?4)",
        params![input.parent_id, name, cat_type, sort_order],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    get_by_id(conn, id)?.ok_or_else(|| "Failed to load created category".to_string())
}

pub fn update(conn: &Connection, input: &UpdateCategoryInput) -> Result<CategoryFlat, String> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err("Category name is required".to_string());
    }

    let existing = get_by_id(conn, input.id)?
        .ok_or_else(|| format!("Category {} not found", input.id))?;
    if existing.archived_at.is_some() {
        return Err("Cannot rename an archived category".to_string());
    }

    conn.execute(
        "UPDATE categories SET name = ?1 WHERE id = ?2",
        params![name, input.id],
    )
    .map_err(|e| e.to_string())?;

    get_by_id(conn, input.id)?.ok_or_else(|| "Failed to load updated category".to_string())
}

pub fn archive(conn: &Connection, id: i64) -> Result<(), String> {
    let existing = get_by_id(conn, id)?
        .ok_or_else(|| format!("Category {id} not found"))?;
    if existing.is_system {
        return Err("System categories cannot be archived".to_string());
    }
    if existing.archived_at.is_some() {
        return Ok(());
    }

    let now = Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    archive_subtree(&tx, id, &now)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn archive_subtree(conn: &Connection, id: i64, archived_at: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE categories SET archived_at = ?1 WHERE id = ?2",
        params![archived_at, id],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id FROM categories WHERE parent_id = ?1 AND archived_at IS NULL")
        .map_err(|e| e.to_string())?;

    let child_ids: Vec<i64> = stmt
        .query_map([id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for child_id in child_ids {
        archive_subtree(conn, child_id, archived_at)?;
    }

    Ok(())
}

fn next_sort_order(conn: &Connection, parent_id: Option<i64>) -> Result<i32, String> {
    let max_order: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), 0) FROM categories
             WHERE parent_id IS ?1 AND archived_at IS NULL",
            params![parent_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(max_order + 10)
}

fn validate_cat_type(cat_type: &str) -> Result<(), String> {
    if matches!(cat_type, "expense" | "income" | "transfer") {
        Ok(())
    } else {
        Err(format!("Invalid category type: {cat_type}"))
    }
}

pub fn is_leaf(conn: &Connection, category_id: i64) -> Result<bool, String> {
    let child_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM categories
             WHERE parent_id = ?1 AND archived_at IS NULL",
            [category_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(child_count == 0)
}