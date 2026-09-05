# Hosting the backend — Oracle Cloud VM (or anywhere)

**Key idea:** unlike the database (which needed `DB_ENGINE` to switch drivers in
code), the *host* needs **no code changes**. The exact same Node/Express app runs
on an Oracle Cloud VM, or any server. Only two things differ per host:

1. **Environment variables** (same set everywhere — see below).
2. **How you start / expose it** (on a VM you run the container and put Nginx +
   HTTPS in front).

The included **`Dockerfile`** makes the app run *identically* on every host, so
moving hosts just means: build the same image, give it the same env vars, and
point the frontend at whichever URL is live.

---

## 1. Environment variables (identical on any host)

Copy from `.env.example`. The important ones:

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (the VM uses 5000). |
| `DB_ENGINE` | `mongo` \| `oracle` \| `dynamo` (your existing DB switch). |
| `MONGO_URI` / `ORACLE_MONGO_URI` | DB connection (per engine). |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `DYNAMODB_TABLE_PREFIX` | only if `DB_ENGINE=dynamo`. |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | auth. |
| `CLIENT_URL` | your frontend origin (for CORS). |
| `NODE_ENV` | `production`. |
| `CLOUDINARY_*`, `SMTP_*`, `RAZORPAY_*` | uploads / email / payments (as used). |

> Switching hosts = deploy this app somewhere, set the **same** env vars, then
> point the frontend's `VITE_API_URL` at the new backend URL and add that URL to
> `CLIENT_URL` (CORS). No code change.

---

## 2. Oracle Cloud Always Free VM (lots of free bandwidth)

Oracle's free tier includes a huge egress allowance and Always-Free compute, and
your Oracle DB already lives there (so backend↔DB traffic is fast/internal).

**One-time VM setup (Ubuntu Always-Free instance):**

```bash
# 1. Install Docker
sudo apt update && sudo apt install -y docker.io git
sudo systemctl enable --now docker

# 2. Get the code + build the image
git clone https://github.com/naikoo68/My-Study-Guide.git
cd My-Study-Guide/backend
sudo docker build -t msg-backend .

# 3. Put your env vars in a file (same keys as above), then run it
#    (restart:always keeps it up across reboots/crashes)
sudo docker run -d --name msg-backend --restart always \
  --env-file /home/ubuntu/msg.env -p 127.0.0.1:5000:5000 msg-backend
```

**Expose it with HTTPS (Nginx + free cert):**

```bash
sudo apt install -y nginx
# /etc/nginx/sites-available/msg  → proxy_pass http://127.0.0.1:5000;
# then:
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

Minimal Nginx server block:

```nginx
server {
    server_name api.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> **Open the ports:** in the VM's OCI **Security List / NSG**, allow inbound
> 80 and 443. Also `sudo ufw allow 80,443/tcp` if the firewall is on.

**Redeploy after code changes:**

```bash
cd ~/My-Study-Guide && git pull
cd backend && sudo docker build -t msg-backend . \
  && sudo docker rm -f msg-backend \
  && sudo docker run -d --name msg-backend --restart always \
     --env-file /home/ubuntu/msg.env -p 127.0.0.1:5000:5000 msg-backend
```

*(No Docker? Alternative: `npm install`, then run with `pm2 start src/server.js
--name msg-backend && pm2 save && pm2 startup`, with the same Nginx front.)*

---

## 3. Pointing the frontend at the backend

1. Set the frontend env `VITE_API_URL` to the active backend URL, e.g.
   `https://api.yourdomain.com/api`.
2. Add that frontend origin to the backend's `CLIENT_URL` (CORS).
3. Redeploy the frontend.

That's the whole "switch." The backend code is the same on both.
