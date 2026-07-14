@echo off
REM FarmXpert Database Backup Script for Windows
REM Run this script to backup your PostgreSQL database
REM
REM USAGE:
REM   Option 1: Set PGPASSWORD environment variable before running
REM             set PGPASSWORD=yourpassword && backup-database.bat
REM   Option 2: Create a .pgpass file in your user folder
REM   Option 3: Use Windows Credential Manager (recommended for scheduled tasks)

REM Configuration - Update these values
SET PGHOST=localhost
SET PGPORT=5432
SET PGUSER=farmxpert_user
SET PGDATABASE=farmxpert_db
SET BACKUP_DIR=C:\FarmXpert\backups

REM Create backup directory if it doesn't exist
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM Generate timestamp for backup filename
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YYYY=%dt:~0,4%"
set "MM=%dt:~4,2%"
set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%"
set "Min=%dt:~10,2%"
set "TIMESTAMP=%YYYY%%MM%%DD%_%HH%%Min%"

REM Set backup filename
SET BACKUP_FILE=%BACKUP_DIR%\farmxpert_backup_%TIMESTAMP%.sql

echo ========================================
echo FarmXpert Database Backup
echo ========================================
echo.
echo Database: %PGDATABASE%
echo Backup File: %BACKUP_FILE%
echo.

REM Check if PGPASSWORD is already set (for automated backups)
if not defined PGPASSWORD (
    echo For automated backups, set PGPASSWORD before running this script.
    echo Example: set PGPASSWORD=yourpassword
    echo.
    set /P "PGPASSWORD=Enter database password: "
)

REM Run pg_dump
echo.
echo Creating backup...
pg_dump -h %PGHOST% -p %PGPORT% -U %PGUSER% -d %PGDATABASE% -F p -f "%BACKUP_FILE%"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Backup created successfully!
    echo File: %BACKUP_FILE%
    
    REM Delete backups older than 7 days
    echo.
    echo Cleaning up old backups (older than 7 days)...
    forfiles /p "%BACKUP_DIR%" /s /m *.sql /d -7 /c "cmd /c del @path" 2>nul
    
    echo.
    echo Backup complete!
) else (
    echo.
    echo ERROR: Backup failed!
    echo Please check your database credentials and try again.
)

REM Clear password from environment for security
set PGPASSWORD=

echo.
pause
