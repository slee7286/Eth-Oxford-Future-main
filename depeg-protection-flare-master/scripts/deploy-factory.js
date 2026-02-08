// scripts/deploy-factory.js
const hre = require("hardhat");
require('dotenv').config();

async function main() {
    console.log("🚀 Deploying Depeg Protection Factory...\n");
    
    const [deployer] = await hre.ethers.getSigners();
    console.log("👤 Deployer:", deployer.address);
    
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("💰 Balance:", hre.ethers.formatEther(balance), "C2FLR\n");
    
    // Deploy Factory
    console.log("📝 Deploying DepegProtectionFactory...");
    const Factory = await hre.ethers.getContractFactory("DepegProtectionFactory");
    const factory = await Factory.deploy();
    
    await factory.waitForDeployment();
    const factoryAddress = await factory.getAddress();
    
    console.log("✅ Factory deployed to:", factoryAddress);
    
    // Save deployment info
    const networkInfo = await hre.ethers.provider.getNetwork();

    const deploymentInfo = {
        network: hre.network.name,
        factoryAddress,
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
        chainId: Number(networkInfo.chainId)  // convert to number
    };
    
    console.log("\n📄 Deployment Info:");
    console.log(JSON.stringify(deploymentInfo, null, 2));
    
    console.log("\n🔗 View on Explorer:");
    console.log(`   https://coston2-explorer.flare.network/address/${factoryAddress}`);
    
    console.log("\n💡 Add to .env:");
    console.log(`   FACTORY_ADDRESS=${factoryAddress}`);
    
    console.log("\n📋 Next Steps:");
    console.log("1. Start oracle server:");
    console.log("   cd oracle && node server.js");
    console.log("\n2. Create a market:");
    console.log(`   FACTORY_ADDRESS=${factoryAddress} ORACLE_SIGNER=<oracle_address> npx hardhat run scripts/create-market.js --network coston2`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Deployment failed!");
        console.error(error);
        process.exit(1);
    });
