# MDP Data Process

MDP (Marketing Data Process) is a desktop application built with Electron, Vue 3, and Quasar. It is designed to process sales data from various distributors, map outlet information, and manage marketing team structures for QL Sales.

## Features

- **Sales Data Processing**: Import and process sales data from CSV, XLSX, and DBF formats.
- **Multi-Distributor Support**: Handles data from APL, TSJ, PPG, and others.
- **Outlet Mapping**: Intelligent tool to map unmapped external outlets to internal master records using SQL, Fuzzy Search, or Meilisearch.
- **Marketing Structure**: Manage monthly marketing team hierarchy/roster (Pejabat, Jabatan, Checkers).
- **FTP Integration**: Download sales data directly from FTP servers.
- **Reports**: Generate comprehensive sales reports.

## Prerequisites

- **Node.js**: v16 or higher (v20+ recommended).
- **MySQL**: Local or remote MySQL database containing the required schema (`mdp_sales`).
- **Meilisearch**: (Optional) For high-performance search functionality in Outlet Mapping.

## Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/perkasajob/MDP-Data-Process.git
    cd "MDP Data Process"
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configuration**:
    - The application uses `config.yaml` for database and FTP settings.
    - Ensure `config.yaml` is present in the application root or the user's AppData folder after installation.
    - **Note**: `src/shims/mysql2.js` and `src/services/DbService.js` handle database connections.

## Running the Application

### Development Mode
To run the application locally with hot-reloading:
```bash
npm run dev
```

### Build for Production
To package the application for Windows (creates an `.exe` installer):
```bash
npm run package
```
The output will be in the `release/` directory.

## User Manual

### 1. Data Process Page
This is the main dashboard for processing daily sales files.
- **Distributor**: Select the source distributor (e.g., APL, TSJ).
- **Date**: Select the transaction date for the data.
- **Sales Document**: Upload the raw sales file (.csv, .xlsx, .dbf).
- **Get FTP**: Click to download the latest sales files from the configured FTP server.
- **Submit**: Processes the uploaded file and inserts/updates sales records in the database.
- **Create Sales Report**: Generates a summary report of processed sales.
- **Update Outlets**: Bulk update outlet master data using a CSV file.

### 2. Outlet Map Page
Used to link (map) outlets from distributor data to your internal Outlet Master.
- **Unmapped Outlets**: Lists outlets from sales data that don't match any internal record.
- **Search Method**:
    - **SQL**: Direct database search (LIKE query).
    - **Fuse**: In-memory fuzzy search.
    - **Meilisearch**: High-performance indexed search (requires Meilisearch server).
    - **Google**: Opens a Google search for the outlet name/address.
- **Suggestions**: Shows potential matches from the master database. Click "Select" to map.
- **Manual Mapping**: You can manually edit `ComID`, `OutID`, or assign an `MR` (Marketing Rep) directly in the table.
- **Sync to Meilisearch**: Updates the search index with the latest master data.

### 3. Marketing Structure Page
Manage the organizational structure for each month.
- **Filter**: Select Year and Month to view the roster.
- **Copy Previous Month**: If a new month has no data, you can copy the entire structure from the previous month.
- **Add Row**: Add a new official (Pejabat).
- **Edit**: Inline editing for Name, Position (Jabatan), and Checker.
- **Save**: Persists changes to the database.

## Troubleshooting

- **"Vite not recognized"**: Ensure you have run `npm install`.
- **Database Connection**: Check your `config.yaml` or environment variables. Ensure MySQL service is running.
- **Meilisearch Error**: If Meilisearch is selected but not running, search functionality will fallback or fail. Ensure the Meilisearch binary in `tools/` (or system service) is running.

## License

Copyright 2025 QL Sales. All rights reserved.
