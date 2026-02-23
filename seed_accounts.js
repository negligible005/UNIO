const { pool } = require('./db');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const seedAccounts = async () => {
    try {
        console.log("Starting account seeding...");

        // 1. Admin Account
        const admin = {
            name: 'Rachel Admin',
            email: 'rachel@gmail.com',
            password: 'root',
            role: 'admin'
        };

        // 2. Parse Dummy Accounts
        const dummyFilePath = path.join(__dirname, 'dummy_accounts.txt');
        const dummyContent = fs.readFileSync(dummyFilePath, 'utf8');
        
        const accounts = [];
        const sections = dummyContent.split('---------------------');
        
        sections.forEach(section => {
            const lines = section.split('\n').map(l => l.trim()).filter(l => l);
            if (lines.length === 0) return;

            const account = {};
            lines.forEach(line => {
                if (line.startsWith('Name:')) account.name = line.replace('Name:', '').trim();
                if (line.startsWith('Email:')) account.email = line.replace('Email:', '').trim();
                if (line.startsWith('Password:')) account.password = line.replace('Password:', '').trim();
                if (line.startsWith('Role:')) account.role = line.replace('Role:', '').trim();
            });

            if (account.email && account.password) {
                accounts.push(account);
            }
        });

        // Combine all accounts
        const allAccounts = [admin, ...accounts];

        console.log(`Found ${allAccounts.length} accounts to process.`);

        for (const account of allAccounts) {
            console.log(`Processing: ${account.email} (${account.role})`);
            
            const hashedPassword = await bcrypt.hash(account.password, 10);
            
            await pool.query(
                `INSERT INTO users (name, email, password, role) 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT (email) 
                 DO UPDATE SET 
                    name = EXCLUDED.name, 
                    password = EXCLUDED.password, 
                    role = EXCLUDED.role`,
                [account.name || account.email, account.email, hashedPassword, account.role || 'consumer']
            );
        }

        console.log("Account seeding completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Error seeding accounts:", error);
        process.exit(1);
    }
};

seedAccounts();
