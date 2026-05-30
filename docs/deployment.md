# TransferVault — Deployment Guide

## Prerequisites

- **Node.js 20+** on your laptop
- **npm 10+**
- A **Supabase** project (free tier works)
- A **GitHub** account (for GitHub Pages hosting)
- **Cloudflare account** (free tier, for Tunnel)

---

## 1. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and paste the contents of `supabase/migrations/001_initial_schema.sql`
3. Run the migration
4. Go to **Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_KEY` (**keep this secret!**)

### Enable Anonymous Sign-Ins (Optional)
1. Go to **Authentication → Providers**
2. Enable **Anonymous Sign-Ins** for guest uploads

---

## 2. Daemon Setup (Your Laptop)

```bash
# Clone the repo
git clone https://github.com/your-user/transfervault.git
cd transfervault

# Install dependencies
npm install --legacy-peer-deps

# Copy env template
cp packages/daemon/.env.example packages/daemon/.env

# Edit .env with your Supabase credentials
# Generate DAEMON_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Build the daemon
npm run build:daemon

# Start in development
npm run dev:daemon

# Start in production (with PM2)
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # Auto-start on boot
```

### Data Directory

Files are stored in `packages/daemon/data/transfers/`. Make sure this drive has enough space.

To use a different drive:
```env
DATA_DIR=D:/vault-storage
```

---

## 3. Cloudflare Tunnel (Expose Laptop to Internet)

### Install cloudflared

```bash
# Windows
winget install Cloudflare.cloudflared

# macOS
brew install cloudflared

# Linux
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
```

### Create Tunnel

```bash
# Login to Cloudflare
cloudflared tunnel login

# Create a tunnel
cloudflared tunnel create transfervault

# Configure the tunnel
# Create config file: ~/.cloudflared/config.yml
```

**~/.cloudflared/config.yml:**
```yaml
tunnel: <YOUR-TUNNEL-ID>
credentials-file: ~/.cloudflared/<YOUR-TUNNEL-ID>.json

ingress:
  - hostname: vault-api.yourdomain.com
    service: http://localhost:3001
  - service: http_status:404
```

```bash
# Add DNS record
cloudflared tunnel route dns transfervault vault-api.yourdomain.com

# Run the tunnel
cloudflared tunnel run transfervault

# Install as a service (auto-start)
cloudflared service install
```

---

## 4. Frontend Deployment (GitHub Pages)

### Local Development
```bash
# Copy env template
cp packages/frontend/.env.example packages/frontend/.env

# Edit with your values
# VITE_DAEMON_URL should be http://localhost:3001 for dev

# Start dev server
npm run dev:frontend
```

### Production Build
```bash
# Set production env vars
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_DAEMON_URL=https://vault-api.yourdomain.com

npm run build:frontend
```

### GitHub Pages Deployment

1. Push code to GitHub
2. Go to **Settings → Pages → Source → GitHub Actions**
3. Add these **Repository Secrets** (Settings → Secrets → Actions):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_DAEMON_URL` (your Cloudflare Tunnel URL)
4. Push to `main` branch — the workflow will build and deploy automatically

---

## 5. Verification Checklist

- [ ] Daemon starts and shows "listening on :3001"
- [ ] `curl http://localhost:3001/health` returns `{"status":"ok"}`
- [ ] Cloudflare Tunnel is running
- [ ] `curl https://vault-api.yourdomain.com/health` returns `{"status":"ok"}`
- [ ] Frontend loads at your GitHub Pages URL
- [ ] Upload a test file → get pair code
- [ ] Use pair code to download → file matches

---

## 6. Disaster Recovery

### Daemon Won't Start
```bash
# Check logs
pm2 logs transfervault-daemon

# Restart
pm2 restart transfervault-daemon

# Check config
node -e "require('dotenv').config({path:'packages/daemon/.env'});console.log(process.env)"
```

### Lost Files
Files live in `DATA_DIR/transfers/`. Back up this directory regularly:
```bash
# Backup
rsync -avz packages/daemon/data/transfers/ /backup/vault/

# Restore
rsync -avz /backup/vault/ packages/daemon/data/transfers/
```

### Database Issues
Supabase stores only metadata. If Supabase data is lost:
1. Files still exist on disk
2. Re-run the migration SQL
3. The daemon will recreate metadata on next upload

### Tunnel Down
```bash
# Check status
cloudflared tunnel info transfervault

# Restart
cloudflared tunnel run transfervault

# Or restart the service
systemctl restart cloudflared  # Linux
```
