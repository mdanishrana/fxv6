# FarmXpert - Windows 11 VPS Deployment Guide

This guide explains how to deploy FarmXpert on your Windows 11 VPS using GitHub.

---

## Prerequisites

Before starting, ensure you have:
- Windows 11 VPS with Administrator access
- Internet connection
- A GitHub account

---

## Step 1: Install Required Software

### 1.1 Install Node.js

1. Download Node.js LTS from: https://nodejs.org/
2. Run the installer (.msi file)
3. Check "Automatically install necessary tools" during installation
4. Open **Command Prompt** and verify:
   ```cmd
   node -v
   npm -v
   ```

### 1.2 Install Git

1. Download Git from: https://git-scm.com/download/win
2. Run the installer with default options
3. Verify installation:
   ```cmd
   git --version
   ```

### 1.3 Install PostgreSQL

1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
2. Run the installer
3. During installation:
   - Set a **strong password** for the `postgres` user (save it!)
   - Keep the default port: **5432**
   - Select all components (PostgreSQL Server, pgAdmin 4, Command Line Tools)
4. Click **Finish** when done

### 1.4 Add PostgreSQL to PATH

1. Press `Win + X` → **System** → **Advanced system settings**
2. Click **Environment Variables**
3. Under "System variables", select **Path** → **Edit**
4. Click **New** and add: `C:\Program Files\PostgreSQL\16\bin` (adjust version number)
5. Click **OK** on all dialogs
6. Restart Command Prompt and verify:
   ```cmd
   psql --version
   ```

### 1.5 Install PM2 (Process Manager)

```cmd
npm install -g pm2
```

---

## Step 2: Create Database

### 2.1 Open pgAdmin or Command Line

**Option A: Using pgAdmin (Graphical)**
1. Open **pgAdmin 4** from Start Menu
2. Connect to your local server (use the password you set during installation)

**Option B: Using Command Line**
1. Open Command Prompt as Administrator
2. Connect to PostgreSQL:
   ```cmd
   psql -U postgres
   ```
3. Enter your password when prompted

### 2.2 Create Database and User

Run these SQL commands (as the `postgres` superuser):

```sql
-- Create a dedicated user for FarmXpert
CREATE USER farmxpert_user WITH PASSWORD 'YourSecurePassword123!';

-- Create the database
CREATE DATABASE farmxpert_db OWNER farmxpert_user;

-- Connect to the new database
\c farmxpert_db

-- Enable UUID extension (requires superuser)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE farmxpert_db TO farmxpert_user;
GRANT ALL ON SCHEMA public TO farmxpert_user;

-- Exit psql
\q
```

**Important:** Replace `YourSecurePassword123!` with a strong password and save it!

---

## Step 3: Clone the Project from GitHub

### 3.1 Create Project Directory

```cmd
mkdir C:\FarmXpert
cd C:\FarmXpert
```

### 3.2 Clone Your Repository

```cmd
git clone https://github.com/YOUR_USERNAME/farmxpert.git .
```

Replace `YOUR_USERNAME` with your actual GitHub username.

---

## Step 4: Configure the Application

### 4.1 Create Environment File

1. Copy the example environment file:
   ```cmd
   copy .env.example .env
   ```

2. Edit the `.env` file with Notepad:
   ```cmd
   notepad .env
   ```

3. Update the values:
   ```
   DATABASE_URL=postgresql://farmxpert_user:YourSecurePassword123!@localhost:5432/farmxpert_db
   PORT=5000
   NODE_ENV=production
   API_KEY=your_gemini_api_key_here
   ```

4. Save and close.

### 4.2 Install Dependencies

```cmd
REM Install frontend dependencies
npm install

REM Install server dependencies
cd server
npm install
cd ..
```

### 4.3 Build the Frontend

```cmd
npm run build
```

This creates the `dist` folder with the production-ready frontend.

---

## Step 5: Setup the Database

### 5.1 Run the Database Setup Script

```cmd
psql -U farmxpert_user -d farmxpert_db -f scripts/setup-database.sql
```

Enter your password when prompted. This creates all tables and demo data.

---

## Step 6: Test the Application

### 6.1 Start the Server Manually (Test)

```cmd
cd server
node index.js
```

You should see: `Server running on port 5000`

### 6.2 Open in Browser

Visit: http://localhost:5000

You should see the FarmXpert login screen with the demo farms.

**Press `Ctrl+C` to stop the server after testing.**

---

## Step 7: Run with PM2 (Production)

### 7.1 Start the Application

```cmd
cd C:\FarmXpert
pm2 start ecosystem.config.cjs
```

### 7.2 Verify It's Running

```cmd
pm2 list
pm2 logs farmxpert
```

### 7.3 Save PM2 Configuration

```cmd
pm2 save
```

### 7.4 Setup Auto-Start on Boot

1. Open **Task Scheduler** (search in Start Menu)
2. Click **Create Task** (right panel)
3. **General tab:**
   - Name: `FarmXpert Auto-Start`
   - Check: "Run with highest privileges"
   - Configure for: Windows 10/11
4. **Triggers tab:**
   - Click **New**
   - Begin the task: "At startup"
   - Click **OK**
5. **Actions tab:**
   - Click **New**
   - Program: `C:\Users\YOUR_USER\AppData\Roaming\npm\pm2.cmd`
   - Arguments: `resurrect`
   - Click **OK**
6. Click **OK** to save the task

---

## Step 8: Configure Windows Firewall

Allow incoming connections to port 5000:

1. Open **Windows Defender Firewall with Advanced Security**
2. Click **Inbound Rules** → **New Rule**
3. Select **Port** → **Next**
4. Select **TCP**, Specific ports: `5000` → **Next**
5. Select **Allow the connection** → **Next**
6. Check all profiles → **Next**
7. Name: `FarmXpert Web Server` → **Finish**

---

## Step 9: Access Your Application

### From the Same Computer
- Open: http://localhost:5000

### From Other Devices on Your Network
- Open: http://YOUR_VPS_IP:5000

### From the Internet (if VPS has public IP)
- Open: http://YOUR_PUBLIC_IP:5000

---

## Optional: Setup Domain Name & SSL

### Using IIS as Reverse Proxy (Recommended for Production)

1. **Enable IIS:**
   - Press `Win + R` → type `appwiz.cpl` → Enter
   - Click "Turn Windows features on or off"
   - Check "Internet Information Services" → OK

2. **Install URL Rewrite & ARR:**
   - Download from: https://www.iis.net/downloads/microsoft/url-rewrite
   - Download ARR from: https://www.iis.net/downloads/microsoft/application-request-routing

3. **Configure Reverse Proxy:**
   - Open IIS Manager
   - Create a new website bound to port 80
   - Add URL Rewrite rule to forward to `localhost:5000`

4. **Add SSL Certificate:**
   - Use **Certify The Web** (free tool for Let's Encrypt): https://certifytheweb.com/

---

## Common Commands Reference

### PM2 Commands

```cmd
pm2 list                  # Show all running apps
pm2 logs farmxpert        # View logs
pm2 restart farmxpert     # Restart app
pm2 stop farmxpert        # Stop app
pm2 delete farmxpert      # Remove from PM2
pm2 monit                 # Real-time monitoring
pm2 save                  # Save current state
pm2 resurrect             # Restore saved state
```

### Database Commands

```cmd
# Backup database
scripts\backup-database.bat

# Connect to database
psql -U farmxpert_user -d farmxpert_db

# View tables
psql -U farmxpert_user -d farmxpert_db -c "\dt"
```

### Git Commands (Update from GitHub)

```cmd
cd C:\FarmXpert
git pull origin main
npm install
npm run build
pm2 restart farmxpert
```

---

## Troubleshooting

### App Not Starting?

1. Check logs:
   ```cmd
   pm2 logs farmxpert
   ```

2. Verify database connection:
   ```cmd
   psql -U farmxpert_user -d farmxpert_db -c "SELECT 1"
   ```

3. Check if port 5000 is in use:
   ```cmd
   netstat -ano | findstr :5000
   ```

### Database Connection Error?

1. Verify PostgreSQL is running:
   ```cmd
   sc query postgresql-x64-16
   ```

2. Start if stopped:
   ```cmd
   net start postgresql-x64-16
   ```

3. Check your `.env` file has correct credentials

### Port Already in Use?

Find and kill the process:
```cmd
netstat -ano | findstr :5000
taskkill /PID <process_id> /F
```

### Changes Not Showing After Update?

1. Rebuild frontend:
   ```cmd
   npm run build
   ```

2. Restart PM2:
   ```cmd
   pm2 restart farmxpert
   ```

---

## Authentication Setup (New!)

The application now uses a professional authentication system with email verification and password reset.

### 1. Run Authentication Database Migration

```cmd
cd E:\fx-rep
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d farmxpert -f scripts/auth-schema.sql
```

Enter the postgres password when prompted.

### 2. Setup Gmail for Email Notifications

1. **Enable 2-Step Verification** on your Google Account:
   - Go to https://myaccount.google.com/security
   - Turn on 2-Step Verification

2. **Create App Password:**
   - Go to https://myaccount.google.com/apppasswords
   - Select app: "Mail"
   - Select device: "Windows Computer"
   - Click **Generate**
   - Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)

### 3. Update Environment Variables

Edit your `.env` file and add:

```
JWT_SECRET=your-very-long-random-secret-key-at-least-32-chars
APP_URL=http://your-server-ip:5000
GMAIL_USER=farmxpertfx@gmail.com
GMAIL_APP_PASSWORD=abcdefghijklmnop
```

**Important:** 
- `JWT_SECRET` should be a random string of 32+ characters
- `GMAIL_APP_PASSWORD` is the 16-character code without spaces

### 4. Restart the Application

```cmd
pm2 restart all
```

### 5. Test the New Login Flow

1. Visit http://your-server-ip:5000
2. You should see the new landing page
3. Click "Get Started" to register a new farm
4. Check your email for verification link

---

## Security Checklist

Before going live:

- [ ] Changed default PostgreSQL password
- [ ] Created dedicated database user (not using `postgres`)
- [ ] Set strong password in `.env` file
- [ ] Set strong JWT_SECRET (32+ random characters)
- [ ] Configured Gmail App Password for emails
- [ ] Firewall configured (only port 5000 open)
- [ ] Regular database backups scheduled
- [ ] SSL certificate installed (for public access)
- [ ] Removed or secured demo accounts for production

---

## Backup Schedule

Set up automatic daily backups:

1. Open **Task Scheduler**
2. Create new task: "FarmXpert Daily Backup"
3. Trigger: Daily at 2:00 AM
4. Action: Run `C:\FarmXpert\scripts\backup-database.bat`

---

## Support

For issues:
1. Check the logs: `pm2 logs farmxpert`
2. Review this guide's troubleshooting section
3. Check GitHub issues on your repository

---

**Your FarmXpert is now deployed on Windows 11!**
