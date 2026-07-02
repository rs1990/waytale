# WayTale Deployment Guide

---

## Local Development

See `README.md` Quick Start. Uses Docker Compose for PostgreSQL + Redis.

```bash
./launch.sh                # All services + Expo
./launch.sh --pipeline     # Also run content pipeline
./launch.sh --no-expo      # Backend + admin only
```

---

## Staging (AWS)

### Prerequisites

```bash
# Install AWS CLI
brew install awscli

# Configure credentials
aws configure
# Enter: Access Key ID, Secret Access Key, region (us-west-2)

# Install Terraform (or use AWS Console)
brew install terraform
```

### 1. PostgreSQL (RDS)

**Via AWS Console:**
1. RDS → Create Database → PostgreSQL 16
2. DB instance class: `db.t4g.medium` (staging)
3. Storage: 100 GB, gp3
4. Multi-AZ: No (staging only; enable for production)
5. Enable encryption (AWS KMS)
6. Create security group allowing inbound 5432 from your IP + backend EC2

**Or via Terraform:**

```hcl
resource "aws_db_instance" "waytale_staging" {
  identifier     = "waytale-staging"
  engine         = "postgres"
  engine_version = "16.3"
  instance_class = "db.t4g.medium"
  allocated_storage = 100
  storage_type   = "gp3"
  
  db_name  = "waytale"
  username = "waytale"
  password = random_password.db_password.result
  
  publicly_accessible = false
  skip_final_snapshot = true  # staging only!
  
  # Encryption
  storage_encrypted = true
  kms_key_id = aws_kms_key.db.arn
}

output "db_endpoint" {
  value = aws_db_instance.waytale_staging.endpoint
}
```

**Initial Schema Setup:**

```bash
# Get RDS endpoint from AWS Console or Terraform output
psql -h waytale-staging.xxxxx.us-west-2.rds.amazonaws.com \
     -U waytale \
     -d waytale \
     < pipeline/src/db/schema.sql

psql -h waytale-staging.xxxxx.us-west-2.rds.amazonaws.com \
     -U waytale \
     -d waytale \
     < pipeline/src/db/schema-v2.sql
```

### 2. S3 Bucket (Audio Storage)

```bash
# Create bucket
aws s3api create-bucket \
  --bucket waytale-audio-staging \
  --region us-west-2 \
  --create-bucket-configuration LocationConstraint=us-west-2

# Enable public read (for CDN)
aws s3api put-bucket-acl \
  --bucket waytale-audio-staging \
  --acl public-read

# Lifecycle: delete old files after 90 days
aws s3api put-bucket-lifecycle-configuration \
  --bucket waytale-audio-staging \
  --lifecycle-configuration '{
    "Rules": [{
      "Status": "Enabled",
      "Prefix": "audio/",
      "Expiration": {"Days": 90}
    }]
  }'
```

**Or via Terraform:**

```hcl
resource "aws_s3_bucket" "waytale_audio" {
  bucket = "waytale-audio-staging"
}

resource "aws_s3_bucket_versioning" "waytale_audio" {
  bucket = aws_s3_bucket.waytale_audio.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "waytale_audio" {
  bucket = aws_s3_bucket.waytale_audio.id
  rule {
    id     = "delete-old-audio"
    status = "Enabled"
    expiration {
      days = 90
    }
  }
}
```

### 3. CloudFront CDN (Optional, for faster audio delivery)

```bash
# Create distribution
aws cloudfront create-distribution \
  --origin-domain-name waytale-audio-staging.s3.us-west-2.amazonaws.com \
  --default-cache-behavior TrustedSigners= \
  --enabled
```

Or configure in AWS Console:
- Origin: S3 bucket
- Compress objects: Yes
- Cache TTL: 86400 (1 day for audio, 3600 for manifests)
- Viewer protocol policy: HTTPS only

### 4. EC2 (Backend + Admin Dashboard)

**Instance Setup:**

```bash
# Launch t3.small instance
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.small \
  --region us-west-2 \
  --key-name waytale-key \
  --security-groups waytale-backend

# SSH in
ssh -i waytale-key.pem ec2-user@<public-ip>
```

**Or via Terraform:**

```hcl
resource "aws_instance" "backend" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t3.small"
  key_name      = aws_key_pair.waytale.key_name
  
  vpc_security_group_ids = [aws_security_group.waytale_backend.id]
  
  tags = { Name = "waytale-backend-staging" }
}

resource "aws_security_group" "waytale_backend" {
  name = "waytale-backend"
  
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["<YOUR_IP>/32"]  # SSH access
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

**Setup Backend on EC2:**

```bash
# SSH to instance
ssh -i waytale-key.pem ec2-user@<public-ip>

# Install dependencies
sudo yum update -y
sudo yum install -y nodejs npm git

# Clone repo
git clone https://github.com/rs1990/waytale.git
cd waytale

# Configure environment
cat > backend/.env << EOF
DATABASE_URL=postgresql://waytale:password@waytale-staging.xxxxx.us-west-2.rds.amazonaws.com:5432/waytale
ADMIN_API_KEY=$(openssl rand -hex 32)
AWS_ACCESS_KEY_ID=<your-aws-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret>
AWS_REGION=us-west-2
AUDIO_OUTPUT_DIR=/var/lib/waytale/audio
S3_BUCKET=waytale-audio-staging
CDN_BASE_URL=https://d123456.cloudfront.net
PORT=3001
EOF

cat > admin/.env << EOF
VITE_ADMIN_KEY=$(cat backend/.env | grep ADMIN_API_KEY | cut -d= -f2)
EOF

# Install + build
cd backend && npm install
cd ../admin && npm install && npm run build
cd ../pipeline && npm install

# Create systemd service for backend
sudo tee /etc/systemd/system/waytale-backend.service << EOF
[Unit]
Description=WayTale Backend
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/waytale/backend
ExecStart=/usr/bin/node /home/ec2-user/waytale/backend/src/index.js
Restart=always
RestartSec=10

Environment="NODE_ENV=production"
Environment="DATABASE_URL=postgresql://..."

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable waytale-backend
sudo systemctl start waytale-backend
sudo systemctl status waytale-backend

# Serve admin dashboard via nginx
sudo yum install -y nginx
sudo tee /etc/nginx/conf.d/waytale.conf << EOF
upstream backend {
  server localhost:3001;
}

server {
  listen 80;
  server_name staging.waytale.com;

  # Admin dashboard (static React build)
  location / {
    root /home/ec2-user/waytale/admin/dist;
    index index.html;
    try_files \$uri /index.html;
  }

  # Proxy API to backend
  location /admin {
    proxy_pass http://backend/admin;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
  }

  location /landmarks {
    proxy_pass http://backend/landmarks;
  }

  location /route {
    proxy_pass http://backend/route;
  }
}
EOF

sudo systemctl enable nginx
sudo systemctl start nginx
```

### 5. Secrets Management (AWS Secrets Manager)

```bash
# Store sensitive values
aws secretsmanager create-secret \
  --name waytale/staging/db-password \
  --secret-string "$(openssl rand -base64 32)"

aws secretsmanager create-secret \
  --name waytale/staging/anthropic-api-key \
  --secret-string "sk-ant-..."

aws secretsmanager create-secret \
  --name waytale/staging/admin-api-key \
  --secret-string "$(openssl rand -hex 32)"

# Retrieve in app
aws secretsmanager get-secret-value \
  --secret-id waytale/staging/db-password \
  --query SecretString --output text
```

**In backend code:**

```js
import AWS from '@aws-sdk/client-secrets-manager';

const client = new AWS.SecretsManager();
const secret = await client.getSecretValue({ SecretId: 'waytale/staging/anthropic-api-key' });
const apiKey = JSON.parse(secret.SecretString).api_key;
```

---

## Production (AWS + GitHub Actions CI/CD)

### 1. Multi-Region RDS Setup

```hcl
# Primary (us-west-2)
resource "aws_db_instance" "waytale_prod" {
  identifier       = "waytale-prod"
  engine           = "postgres"
  instance_class   = "db.t4g.large"
  allocated_storage = 500
  multi_az         = true  # High availability
  
  backup_retention_period = 30  # 30-day retention
  enabled_cloudwatch_logs_exports = ["postgresql"]
}

# Read replica (us-east-1)
resource "aws_db_instance" "waytale_prod_replica" {
  identifier          = "waytale-prod-read-us-east-1"
  replicate_source_db = aws_db_instance.waytale_prod.identifier
  instance_class      = "db.t4g.large"
  availability_zone   = "us-east-1a"
  publicly_accessible = false
}
```

### 2. Auto-Scaling Backend Fleet

```hcl
resource "aws_autoscaling_group" "backend" {
  launch_configuration = aws_launch_configuration.backend.id
  min_size             = 2
  max_size             = 10
  desired_capacity     = 2
  vpc_zone_identifier  = [aws_subnet.a.id, aws_subnet.b.id]
  
  health_check_type         = "ELB"
  health_check_grace_period = 300
}

resource "aws_lb" "backend" {
  name            = "waytale-backend-alb"
  internal        = false
  security_groups = [aws_security_group.alb.id]
  subnets         = [aws_subnet.a.id, aws_subnet.b.id]
}

resource "aws_lb_target_group" "backend" {
  name        = "waytale-backend"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  health_check {
    path    = "/health"
    matcher = "200"
  }
}
```

### 3. GitHub Actions CI/CD Pipeline

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Staging

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: 22
      
      - name: Install dependencies
        run: |
          cd backend && npm ci
          cd ../pipeline && npm ci
          cd ../admin && npm ci
      
      - name: Lint
        run: |
          cd backend && npm run lint 2>/dev/null || true
      
      - name: Type check (if using TS)
        run: echo "Skipping (using plain JS)"

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to EC2
        env:
          SSH_KEY: ${{ secrets.EC2_SSH_KEY }}
          EC2_HOST: ${{ secrets.EC2_HOST }}
        run: |
          mkdir -p ~/.ssh
          echo "$SSH_KEY" > ~/.ssh/id_rsa
          chmod 600 ~/.ssh/id_rsa
          ssh -o StrictHostKeyChecking=no -i ~/.ssh/id_rsa ec2-user@$EC2_HOST << 'DEPLOY'
            cd waytale
            git pull origin main
            cd backend && npm install && npm run build 2>/dev/null || true
            sudo systemctl restart waytale-backend
            echo "✓ Backend deployed"
          DEPLOY
```

### 4. Monitoring (CloudWatch)

```bash
# Log group
aws logs create-log-group --log-group-name /waytale/backend

# Alarms
aws cloudwatch put-metric-alarm \
  --alarm-name waytale-backend-errors \
  --alarm-description "Alert if error rate > 5%" \
  --metric-name HTTPServerErrors \
  --namespace AWS/ApplicationELB \
  --statistic Sum \
  --period 300 \
  --threshold 50 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-west-2:123456789:alerts
```

---

## Content Pipeline (Async Job Queue)

For production, don't run refresh inline. Use a job queue:

### Setup: Bull.js + Redis

```bash
npm install bull
```

**backend/src/queue.js:**

```js
import Queue from 'bull';

export const refreshQueue = new Queue('landmark-refresh', {
  redis: { host: process.env.REDIS_HOST, port: 6379 }
});

// Process jobs
refreshQueue.process(5, async (job) => {  // 5 concurrent
  const { landmarkId } = job.data;
  const result = await refreshLandmark(landmarkId);
  return result;
});

refreshQueue.on('completed', (job) => {
  console.log(`Refresh completed: ${job.data.landmarkId}`);
});

refreshQueue.on('failed', (job, err) => {
  console.error(`Refresh failed: ${job.data.landmarkId}`, err);
});
```

**backend/src/routes/admin.js (updated):**

```js
router.post('/refresh-all', async (req, res) => {
  const { landmarks } = await db.query('SELECT id FROM landmarks');
  
  for (const lm of landmarks) {
    await refreshQueue.add({ landmarkId: lm.id }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });
  }
  
  res.json({ success: true, queued: landmarks.length });
});
```

**Admin dashboard sees status:**

```js
refreshQueue.getCountByState('active', 'waiting', 'completed', 'failed')
  .then(counts => res.json(counts));
```

---

## Rollback Procedure

If deployment breaks:

```bash
# SSH to EC2
ssh -i key.pem ec2-user@prod-host

# Check status
sudo systemctl status waytale-backend
sudo journalctl -u waytale-backend -n 50

# Rollback to last working commit
git revert HEAD
git push

# Wait for GitHub Actions to deploy
# Or manual rollback:
git checkout <known-good-commit>
npm install && npm run build
sudo systemctl restart waytale-backend
```

---

## Cost Estimation

| Component | Tier | Cost/Month |
|-----------|------|-----------|
| RDS PostgreSQL | t4g.medium (staging) | $40 |
| RDS PostgreSQL | db.t4g.large (prod) | $160 |
| EC2 | t3.small × 2 (backend) | $40 |
| S3 | 100 GB audio + requests | $10 |
| CloudFront | 1 TB data out | $85 |
| Secrets Manager | 1 secret × 4 retrieval/day | $0.40 |
| **Total (Staging)** | — | ~$50/month |
| **Total (Production)** | — | ~$350/month |

Scales with:
- RDS storage + read replicas: +$100–200 per replica
- EC2 instances: +$20 per instance
- Audio delivery: scales with users (CDN costs)

---

## Security Checklist

- [ ] RDS encrypted at rest (AWS KMS)
- [ ] VPC security groups restrict inbound (backend, 5432)
- [ ] Secrets Manager for API keys (not in .env)
- [ ] Enable RDS backups (30-day retention minimum)
- [ ] SSL/TLS for CloudFront + ALB (ACM certificate)
- [ ] WAF rules on ALB (SQL injection, XSS, DDoS)
- [ ] CloudTrail logging for all API calls
- [ ] VPC Flow Logs for network analysis
- [ ] Budget alerts in AWS console (prevent surprise charges)

---

## Maintenance

### Weekly
- Check CloudWatch dashboards
- Review error logs
- Monitor database size

### Monthly
- RDS backup test (restore to staging)
- Security updates (OS, dependencies)
- Cost analysis

### Quarterly
- Disaster recovery drill (full RDS restore)
- Load testing (simulate peak users)
- Dependency updates + testing
