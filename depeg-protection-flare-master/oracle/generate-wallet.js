// oracle/generate-wallet.js
/**
 * @title Oracle Wallet Generator
 * @notice Generates a new wallet for oracle signing
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

function generateWallet() {
    console.log('🔐 Generating Oracle Wallet...\n');
    
    // Generate random wallet
    const wallet = ethers.Wallet.createRandom();
    
    console.log('✅ Wallet Generated:\n');
    console.log('Address:', wallet.address);
    console.log('Private Key:', wallet.privateKey);
    console.log('\n⚠️  IMPORTANT: Keep the private key secret!\n');
    
    // Save to .env format
    const envContent = `
# Oracle Wallet (Generated ${new Date().toISOString()})
ORACLE_PRIVATE_KEY=${wallet.privateKey}
ORACLE_SIGNER=${wallet.address}
`;
    
    const envPath = path.join(__dirname, '..', '.env.oracle');
    fs.writeFileSync(envPath, envContent.trim() + '\n');
    
    console.log('💾 Saved to .env.oracle');
    console.log('\n📋 Add these to your main .env file:');
    console.log(envContent);
    console.log('\n💡 Usage in market creation:');
    console.log(`ORACLE_SIGNER=${wallet.address} npx hardhat run scripts/create-market.js`);
    
    return {
        address: wallet.address,
        privateKey: wallet.privateKey
    };
}

if (require.main === module) {
    generateWallet();
}

module.exports = generateWallet;
