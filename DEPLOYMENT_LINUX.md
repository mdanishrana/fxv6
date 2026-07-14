# FarmXpert - Ubuntu/Linux VPS Deployment Guide

Complete step-by-step guide to deploy FarmXpert on Ubuntu 24.04 LTS (Contabo or any VPS provider).

## Prerequisites

- Ubuntu 24.04 LTS VPS with root/sudo access
- Domain name (optional, for SSL)
- SSH access to your server

---

## Step 1: Initial Server Setup

### 1.1 Connect to your VPS
```bash
ssh root@YOUR_SERVER_IP
```

### 1.2 Update system packages
```bash
apt update && apt upgrade -y
```

### 1.3 Create a non-root user (recommended)
```bash
adduser farmxpert
usermod -aG sudo farmxpert
su - farmxpert
```

---

## Step 2: Install Node.js 20 LTS

```bash
# Install Node.js using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version   # Should show v20.x.x
npm --version    # Should show 10.x.x
```

---

## Step 3: Install PostgreSQL 16

```bash
# Add PostgreSQL official repository
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update

# Install PostgreSQL
sudo apt install -y postgresql-16 postgresql-contrib-16

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify
sudo systemctl status postgresql
```

---

## Step 4: Configure PostgreSQL Database

```bash
# Switch to postgres user
sudo -i -u postgres

# Create database and user
psql

# In PostgreSQL shell, run:
CREATE USER farmxpert_user WITH PASSWORD 'YourSecurePassword123';
CREATE DATABASE farmxpert_db OWNER farmxpert_user;
GRANT ALL PRIVILEGES ON DATABASE farmxpert_db TO farmxpert_user;
\q

# Exit postgres user
exit
```

### 4.1 Allow password authentication (if needed)
```bash
# Edit pg_hba.conf
sudo nano /etc/postgresql/16/main/pg_hba.conf

# Find the line with "local all all peer" and change to:
# local   all             all                                     md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

---

## Step 5: Install PM2 Process Manager

```bash
sudo npm install -g pm2

# Verify
pm2 --version
```

---

## Step 6: Clone and Setup Application

### 6.1 Create application directory
```bash
sudo mkdir -p /var/www/farmxpert
sudo chown -R $USER:$USER /var/www/farmxpert
cd /var/www/farmxpert
```

### 6.2 Clone repository
```bash
git clone https://github.com/mdanishrana/fx-rep.git .
```

### 6.3 Install dependencies
```bash
# Install root dependencies (frontend)
npm install

# Install server dependencies
cd server
npm install
cd ..
```

### 6.4 Build frontend
```bash
npm run build
```

---

## Step 7: Configure Environment Variables

### 7.1 Create .env file
```bash
nano .env
```

### 7.2 Add these variables:
```env
# Database
DATABASE_URL=postgresql://farmxpert_user:YourSecurePassword123@localhost:5432/farmxpert_db

# JWT Authentication
JWT_SECRET=YourSuperSecretRandomKeyHere123456789

# Application URL (use your domain or IP)
APP_URL=http://YOUR_SERVER_IP:5000

# Gmail for email notifications (optional)
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-16-char-app-password

# Google Gemini AI (optional, for AI features)
API_KEY=your-gemini-api-key

# Server Port
PORT=5000
```

Save with `Ctrl+X`, then `Y`, then `Enter`.

---

## Step 8: Initialize Database Schema

```bash
# Connect to database and run schema
PGPASSWORD=YourSecurePassword123 psql -U farmxpert_user -d farmxpert_db -h localhost -f scripts/setup-database-linux.sql
```

If setup-database.sql doesn't exist, create the tables manually:

```bash
PGPASSWORD=YourSecurePassword123 psql -U farmxpert_user -d farmxpert_db -h localhost
```

Then run:
```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) CHECK (role IN ('OWNER', 'MANAGER', 'LABOR', 'SAAS_ADMIN')) NOT NULL,
    password_hash VARCHAR(255),
    is_verified BOOLEAN DEFAULT false,
    verification_token VARCHAR(255),
    verification_expires TIMESTAMP,
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    tier VARCHAR(50) DEFAULT 'BASIC',
    modules TEXT[] DEFAULT ARRAY['CORE'],
    status VARCHAR(50) DEFAULT 'ACTIVE',
    owner_email VARCHAR(255),
    manager_email VARCHAR(255),
    smtp_settings JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cattle table
CREATE TABLE IF NOT EXISTS cattle (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    tag_number VARCHAR(50) NOT NULL,
    type VARCHAR(50),
    breed VARCHAR(100),
    gender VARCHAR(20),
    teeth INTEGER,
    color VARCHAR(50),
    status VARCHAR(50) DEFAULT 'ACTIVE',
    arrival_type VARCHAR(50),
    entry_date DATE,
    entry_weight NUMERIC,
    current_weight NUMERIC,
    target_weight NUMERIC,
    daily_target_gain NUMERIC,
    purchase_price NUMERIC,
    weight_history JSONB DEFAULT '[]',
    vaccination_status BOOLEAN DEFAULT false,
    vaccination_history JSONB DEFAULT '[]',
    transactions JSONB DEFAULT '[]',
    owner_name VARCHAR(255),
    monthly_package_id VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Feed items table
CREATE TABLE IF NOT EXISTS feed_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    stock_quantity NUMERIC DEFAULT 0,
    cost_per_kg NUMERIC DEFAULT 0,
    protein_percentage NUMERIC DEFAULT 0,
    energy_mcal NUMERIC DEFAULT 0,
    min_stock_level NUMERIC DEFAULT 500,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Feed packages table
CREATE TABLE IF NOT EXISTS feed_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    daily_intake_percent NUMERIC DEFAULT 2.5,
    items JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create SaaS Admin user
INSERT INTO users (name, email, role, password_hash, is_verified)
VALUES ('SaaS Admin', 'admin@farmxpert.pk', 'SAAS_ADMIN', '$2b$12$nxSGUuNjcrqtNU4vtooWzO2sf61NJ5hO4HKtseOfwXrRT/SE/zMmi', true)
ON CONFLICT (email) DO NOTHING;

\q
```

---

## Step 9: Start Application with PM2

### 9.1 Create PM2 ecosystem file
```bash
nano ecosystem.config.cjs
```

Add:
```javascript
module.exports = {
  apps: [{
    name: 'farmxpert',
    script: 'server/index.js',
    cwd: '/var/www/farmxpert',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    }
  }]
};
```

### 9.2 Start the application
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### 9.3 Verify it's running
```bash
pm2 status
pm2 logs farmxpert
```

---

## Step 10: Configure Firewall

```bash
# Enable UFW firewall
sudo ufw allow OpenSSH
sudo ufw allow 5000/tcp
sudo ufw enable

# Check status
sudo ufw status
```

---

## Step 11: Access Your Application

Open in browser:
```
http://YOUR_SERVER_IP:5000
```

### Default Admin Login:
- **Email:** admin@farmxpert.pk
- **Password:** Admin@123

---

## Step 12: (Optional) Setup Nginx Reverse Proxy

For production with domain name and SSL:

### 12.1 Install Nginx
```bash
sudo apt install -y nginx
```

### 12.2 Create Nginx config
```bash
sudo nano /etc/nginx/sites-available/farmxpert
```

Add:
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 12.3 Enable site
```bash
sudo ln -s /etc/nginx/sites-available/farmxpert /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo ufw allow 'Nginx Full'
```

### 12.4 Install SSL with Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

---

## Maintenance Commands

### View logs
```bash
pm2 logs farmxpert
pm2 logs farmxpert --lines 100
```

### Restart application
```bash
pm2 restart farmxpert
```

### Stop application
```bash
pm2 stop farmxpert
```

### Update application
```bash
cd /var/www/farmxpert
git pull origin main
npm install
cd server && npm install && cd ..
npm run build
pm2 restart farmxpert
```

### Database backup
```bash
PGPASSWORD=YourSecurePassword123 pg_dump -U farmxpert_user -h localhost farmxpert_db > backup_$(date +%Y%m%d).sql
```

### Restore database
```bash
PGPASSWORD=YourSecurePassword123 psql -U farmxpert_user -h localhost farmxpert_db < backup_file.sql
```

---

## Troubleshooting

### Check if app is running
```bash
pm2 status
curl http://localhost:5000
```

### Check PostgreSQL connection
```bash
PGPASSWORD=YourSecurePassword123 psql -U farmxpert_user -h localhost -d farmxpert_db -c "SELECT 1"
```

### Check logs for errors
```bash
pm2 logs farmxpert --err --lines 50
```

### Port already in use
```bash
sudo lsof -i :5000
sudo kill -9 PID_NUMBER
```

### Permission issues
```bash
sudo chown -R $USER:$USER /var/www/farmxpert
```

---

## Security Recommendations

1. **Change default admin password immediately after first login**
2. **Use strong database password**
3. **Enable SSL with domain name**
4. **Keep system updated:** `sudo apt update && sudo apt upgrade -y`
5. **Configure fail2ban for SSH protection:**
   ```bash
   sudo apt install -y fail2ban
   sudo systemctl enable fail2ban
   ```

---

## Quick Reference

| Service | Command |
|---------|---------|
| Start app | `pm2 start farmxpert` |
| Stop app | `pm2 stop farmxpert` |
| Restart app | `pm2 restart farmxpert` |
| View logs | `pm2 logs farmxpert` |
| PostgreSQL status | `sudo systemctl status postgresql` |
| Nginx status | `sudo systemctl status nginx` |

---

**Deployment Complete!** Your FarmXpert application should now be running on your Ubuntu VPS.
