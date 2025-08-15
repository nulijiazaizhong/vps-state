import sqlite3

DB_FILE = "backend/nezha_data.db"

def view_tcping_data():
    """连接到数据库并打印 tcping_history 表中的数据"""
    print(f"--- Connecting to database: {DB_FILE} ---")
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        print("\n--- Checking for 'tcping_history' table ---")
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tcping_history';")
        if not cursor.fetchone():
            print("Error: Table 'tcping_history' not found in the database.")
            return

        print("\n--- Fetching first 10 rows from 'tcping_history' ---")
        cursor.execute("SELECT * FROM tcping_history LIMIT 10;")
        rows = cursor.fetchall()

        if not rows:
            print("No data found in 'tcping_history' table.")
        else:
            print(f"Found {len(rows)} records:")
            for row in rows:
                print(dict(row))

    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        if conn:
            conn.close()
        print("\n--- Database connection closed ---")

if __name__ == "__main__":
    view_tcping_data()
