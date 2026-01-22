# SGIPC Standing - Vercel Deployment Guide

## 📋 Prerequisites
- GitHub account
- Vercel account (sign up at vercel.com)
- MongoDB Atlas account (for database)

## 🗄️ Step 1: Setup MongoDB Atlas

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up or log in
3. Create a **FREE** cluster (M0 Sandbox)
4. Click **"Database Access"** → **"Add New Database User"**
   - Create username and password
   - Write these down - you'll need them!
5. Click **"Network Access"** → **"Add IP Address"**
   - Click **"Allow Access from Anywhere"** (0.0.0.0/0)
   - This is required for Vercel
6. Click **"Database"** → **"Connect"** → **"Connect your application"**
7. Copy the connection string (looks like):
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
8. Replace `<password>` with your actual password
9. Add a database name after `.net/` like: `...mongodb.net/sgipc?retryWrites...`

## 📤 Step 2: Push Code to GitHub

```bash
cd /home/dipra/SGIPCStanding
git init
git add .
git commit -m "Ready for Vercel deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

## 🚀 Step 3: Deploy to Vercel

1. Go to [Vercel](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Select your GitHub repository
4. Vercel will auto-detect the settings from `vercel.json`
5. **DO NOT DEPLOY YET** - click **"Configure Project"**

## 🔐 Step 4: Add Environment Variables (CRITICAL!)

In the "Environment Variables" section, add these:

### Variable 1: MONGODB_URI
- **Name**: `MONGODB_URI`
- **Value**: Your full MongoDB connection string from Step 1
- Example: `mongodb+srv://admin:mypassword123@cluster0.xxxxx.mongodb.net/sgipc?retryWrites=true&w=majority`
- **Important**: Make sure password special characters are URL-encoded

### Variable 2: JWT_SECRET
- **Name**: `JWT_SECRET`
- **Value**: Any random secret string (create your own)
- Example: `my-super-secret-jwt-key-2024-sgipc-12345`

### Variable 3: NODE_ENV
- **Name**: `NODE_ENV`
- **Value**: `production`

### Variable 4: PORT (Optional)
- **Name**: `PORT`
- **Value**: `5000`

**Make sure to add ALL variables to:**
- ✅ Production
- ✅ Preview
- ✅ Development

## ✅ Step 5: Deploy!

1. After adding all environment variables, click **"Deploy"**
2. Wait 2-3 minutes for build to complete
3. You'll get a URL like: `https://your-project.vercel.app`
4. Click the URL to open your live site!

## 🔑 First Login

1. Go to: `https://your-project.vercel.app/admin`
2. Login with:
   - **Username**: `admin`
   - **Password**: `admin`
3. ⚠️ **IMPORTANT**: Change the admin password immediately!

## 🔄 Future Updates

To update your deployed site:
```bash
git add .
git commit -m "Your update message"
git push
```
Vercel will automatically redeploy!

## 🐛 Troubleshooting

### "Cannot connect to database"
- Check your MongoDB connection string in Vercel environment variables
- Ensure 0.0.0.0/0 is whitelisted in MongoDB Network Access
- Verify your MongoDB password doesn't have special characters (or URL encode them)

### "Build failed"
- Check Vercel build logs
- Ensure all dependencies are in package.json
- Verify vercel.json is correctly configured

### "API routes not working"
- Check if environment variables are set for Production
- Verify MONGODB_URI and JWT_SECRET are correct
- Check server logs in Vercel dashboard

## 📝 Environment Variables Summary

| Variable | Where to Get It | Example |
|----------|----------------|---------|
| `MONGODB_URI` | MongoDB Atlas → Connect → Connection String | `mongodb+srv://user:pass@cluster.net/db` |
| `JWT_SECRET` | Create your own random string | `your-secret-key-here` |
| `NODE_ENV` | Set to `production` | `production` |

---

Need help? Check the README.md for more details!
