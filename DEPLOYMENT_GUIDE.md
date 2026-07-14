# FarmXpert VPS Deployment Guide

This guide will help you deploy FarmXpert to your own Ubuntu VPS server.

## Prerequisites

- Ubuntu 20.04 or 22.04 VPS (DigitalOcean, Linode, AWS, etc.)
- Root or sudo access
- Domain name (optional, but recommended)

---

## Step 1: Initial Server Setup

SSH into your VPS:
```bash
ssh root@your_server_ip
```

Update the system:
```bash
apt update && apt upgrade -y
```

Create a non-root user (recommended):
```bash
adduser farmxpert
usermod -aG sudo farmxpert
su - farmxpert
```

---

## Step 2: Install Node.js

Install Node.js 20.x:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify installation:
```bash
node --version  # Should show v20.x.x
npm --version
```

---

## Step 3: Install PostgreSQL

Install PostgreSQL:
```bash
sudo apt install -y postgresql postgresql-contrib
```

Create database and user:
```bash
sudo -u postgres psql
```

In PostgreSQL shell, run:
```sql
CREATE USER farmxpert WITH PASSWORD 'your_secure_password_here';
CREATE DATABASE farmxpert_db OWNER farmxpert;
GRANT ALL PRIVILEGES ON DATABASE farmxpert_db TO farmxpert;
\q
```

---

## Step 4: Upload Your Application

**Option A: Using Git (Recommended)**

Install Git and clone:
```bash
sudo apt install -y git
cd /home/farmxpert
git clone https://github.com/your-username/farmxpert.git
cd farmxpert
```

**Option B: Using SCP/SFTP**

From your local machine, compress and upload:
```bash
# On your local machine
zip -r farmxpert.zip . -x "node_modules/*" -x ".git/*"
scp farmxpert.zip farmxpert@your_server_ip:/home/farmxpert/
```

On server, extract:
```bash
cd /home/farmxpert
unzip farmxpert.zip -d farmxpert
cd farmxpert
```

---

## Step 5: Configure Environment Variables

Create a `.env` file in the server folder:
```bash
nano server/.env
```

Add these variables:
```env
# Database Connection
DATABASE_URL=postgresql://farmxpert:your_secure_password_here@localhost:5432/farmxpert_db

# Server Configuration
PORT=5000
NODE_ENV=production

# AI Features (Optional - Get from Google AI Studio)
API_KEY=your_gemini_api_key_here
```

Save and exit (Ctrl+X, then Y, then Enter).

---

## Step 6: Install Dependencies & Build

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server && npm install && cd ..

# Build the frontend
npm run build
```

---

## Step 7: Initialize Database

The database tables will be created automatically when the server first connects.

To seed demo data (optional), you can run the SQL from your development environment or manually insert via psql.

---

## Step 8: Install PM2 (Process Manager)

PM2 keeps your app running 24/7 and restarts it if it crashes:

```bash
sudo npm install -g pm2
```

Start the application:
```bash
cd /home/farmxpert/farmxpert
pm2 start server/index.js --name "farmxpert"
```

Set PM2 to start on boot:
```bash
pm2 startup
pm2 save
```

Useful PM2 commands:
```bash
pm2 status          # Check app status
pm2 logs farmxpert  # View logs
pm2 restart farmxpert  # Restart app
pm2 stop farmxpert     # Stop app
```

---

## Step 9: Configure Nginx (Reverse Proxy)

Install Nginx:
```bash
sudo apt install -y nginx
```

Create Nginx configuration:
```bash
sudo nano /etc/nginx/sites-available/farmxpert
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name your_domain.com www.your_domain.com;

    location / {
        proxy_pass http://localhost:5000;
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

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/farmxpert /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

---

## Step 10: Configure Firewall

```bash
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## Step 11: Set Up SSL (HTTPS) - Recommended

Install Certbot:
```bash
sudo apt install -y certbot python3-certbot-nginx
```

Get SSL certificate:
```bash
sudo certbot --nginx -d your_domain.com -d www.your_domain.com
```

Follow the prompts. Certbot will automatically configure Nginx for HTTPS.

---

## Maintenance Commands

**Update the application:**
```bash
cd /home/farmxpert/farmxpert
git pull  # If using Git
npm install
npm run build
pm2 restart farmxpert
```

**View logs:**
```bash
pm2 logs farmxpert --lines 100
```

**Database backup:**
```bash
pg_dump -U farmxpert farmxpert_db > backup_$(date +%Y%m%d).sql
```

**Database restore:**
```bash
psql -U farmxpert farmxpert_db < backup_file.sql
```

---

## Troubleshooting

**App not starting?**
```bash
pm2 logs farmxpert  # Check for errors
```

**Database connection issues?**
```bash
# Test PostgreSQL connection
psql -U farmxpert -d farmxpert_db -h localhost
```

**Port already in use?**
```bash
sudo lsof -i :5000  # Find what's using port 5000
```

**Permission issues?**
```bash
sudo chown -R farmxpert:farmxpert /home/farmxpert/farmxpert
```

---

## Security Checklist

Before going live, ensure you:

- [ ] Changed default PostgreSQL password
- [ ] Set up HTTPS with SSL certificate
- [ ] Configured firewall (UFW)
- [ ] Set secure environment variables
- [ ] Implemented proper user authentication (replace demo login)
- [ ] Set up regular database backups
- [ ] Keep system and packages updated

---

## Support

Your FarmXpert instance should now be accessible at:
- HTTP: http://your_server_ip:5000 (direct)
- HTTP: http://your_domain.com (via Nginx)
- HTTPS: https://your_domain.com (after SSL setup)

For production use, remember to implement proper authentication to replace the demo login system.
