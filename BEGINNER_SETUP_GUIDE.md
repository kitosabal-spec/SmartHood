# SmartHood Backend Setup Guide

This project now uses Node.js, Express.js, and MySQL.

## 1. Open the Folder in VS Code

1. Open VS Code.
2. Click `File`.
3. Click `Open Folder`.
4. Select this folder:

```text
C:\Users\96656\Music\San
```

## 2. Files Added

These backend files were added:

```text
package.json
server.js
```

What each file does:

```text
package.json     Lists the Node.js packages and start commands.
server.js        Runs the Express backend and connects to MySQL.
MySQL database   Stores your homeowners, bills, payments, complaints, announcements, logs, and notifications.
```

Your existing frontend files are still used:

```text
index.html
styles.css
script.js
```

## 3. Make Sure MySQL is Running

Start MySQL first. If you use XAMPP, start the MySQL service from the XAMPP Control Panel.

The app uses these default MySQL settings:

```text
host: localhost
port: 3306
user: root
password: empty
database: san_alfonso_homes
```

If your MySQL password or database name is different, set these before starting the app:

```bash
set MYSQL_HOST=localhost
set MYSQL_PORT=3306
set MYSQL_USER=root
set MYSQL_PASSWORD=your_password
set MYSQL_DATABASE=san_alfonso_homes
```

## 4. Install the Backend Packages

In VS Code, open the terminal:

```text
Terminal > New Terminal
```

Make sure the terminal is inside this folder:

```text
C:\Users\96656\Music\San
```

Run this command:

```bash
npm.cmd install
```

Use `npm.cmd` on your computer because PowerShell may block `npm.ps1`.

## 5. Start the System

Run:

```bash
npm.cmd start
```

You should see:

```text
SmartHood is running at http://localhost:3000
MySQL database: localhost:3306/san_alfonso_homes
```

Keep this terminal open while using the system.

## 6. Open the App

Open your browser and go to:

```text
http://localhost:3000
```

Do not open `index.html` directly anymore. The page must be opened through the Node.js server so it can talk to MySQL.

## 7. Login Accounts

Admin:

```text
username: admin
password: admin123
```

Homeowner:

```text
username: juandelacruz
password: home123
```

## 8. Test if the Database is Working

Open a second VS Code terminal and run:

```bash
curl http://localhost:3000/api/health
```

You should see something like:

```json
{"ok":true,"database":"san_alfonso_homes","host":"localhost","port":3306,"users":723}
```

You can also test login:

```bash
curl -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"admin123\"}"
```

## 9. How Your Forms Save to MySQL

Your forms still use the same buttons in the frontend. The important change is in `script.js`.

Before:

```text
The app saved data only in the browser using localStorage.
```

Now:

```text
The app sends data to server.js using fetch().
server.js receives the request through /api routes.
server.js saves the record into MySQL.
```

Examples:

```text
Add Homeowner      -> saves to the users table
Create Billing     -> saves to the billings table
Submit Payment     -> saves to the payments table
File Complaint     -> saves to the complaints table
Post Announcement  -> saves to the announcements table
Audit Log          -> saves to the auditLog table
Notifications      -> saves to the notifications table
```

## 10. Important API Routes

```text
GET    /api/health          Check if backend and database are working
GET    /api/data            Load all app data
POST   /api/login           Login user
POST   /api/users           Add a user
PUT    /api/users/:id       Update a user
DELETE /api/users/:id       Delete a user
POST   /api/billings        Add a billing
POST   /api/payments        Add a payment
POST   /api/complaints      Add a complaint
POST   /api/announcements   Add an announcement
POST   /api/reset           Reset database to demo data
```

## 11. Stop the Server

In the terminal where the server is running, press:

```text
Ctrl + C
```

Then type:

```text
Y
```

## 12. Common Problem

If the browser shows a message saying to start the Node.js server, it means you opened the HTML file directly or the server is not running.

Fix:

```bash
npm.cmd start
```

Then open:

```text
http://localhost:3000
```
