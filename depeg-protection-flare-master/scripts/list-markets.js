// scripts/list-markets.js
const hre = require("hardhat");

async function main() {
    const factoryAddress = process.env.FACTORY_ADDRESS || process.argv[2];
    
    if (!factoryAddress) {
        console.error("❌ Please provide factory address:");
        console.error("   FACTORY_ADDRESS=0x... npx hardhat run scripts/list-markets.js --network coston2");
        process.exit(1);
    }
    
    console.log("📋 Listing All Depeg Protection Markets\n");
    console.log("Factory:", factoryAddress);
    
    const factory = await hre.ethers.getContractAt("DepegProtectionFactory", factoryAddress);
    
    const count = await factory.marketsCount();
    console.log(`\nTotal Markets: ${count}\n`);
    
    if (count === 0n) {
        console.log("No markets created yet.");
        console.log("\n💡 Create one with:");
        console.log(`   FACTORY_ADDRESS=${factoryAddress} npx hardhat run scripts/create-market.js --network coston2`);
        return;
    }
    
    console.log("─".repeat(80));
    
    for (let i = 0; i < count; i++) {
        const marketInfo = await factory.getMarket(i);
        const marketAddress = marketInfo[0];
        const creator = marketInfo[1];
        const createdAt = marketInfo[2];
        
        const market = await hre.ethers.getContractAt("DepegProtectionMarket", marketAddress);
        
        const config = await market.getConfig();
        const feedId = config[0];
        const barrierPpm = config[1];
        const windowSec = config[2];
        const horizonSec = config[3];
        const lambdaMinBps = config[4];
        const lambdaMaxBps = config[5];
        const reserveBps = config[6];
        const oracleSigner = config[8];
        
        const totalLiq = await market.totalLiquidity();
        const exposure = await market.outstandingExposure();
        const utilization = await market.utilizationBps();
        const lambda = await market.currentLambdaBps();
        
        console.log(`\n📊 Market #${i}`);
        console.log(`   Address: ${marketAddress}`);
        console.log(`   Creator: ${creator}`);
        console.log(`   Created: ${new Date(Number(createdAt) * 1000).toISOString()}`);
        console.log(`   Feed ID: ${feedId}`);
        
        console.log(`\n   Parameters:`);
        console.log(`     Barrier: ${(Number(barrierPpm) / 1_000_000).toFixed(6)}`);
        console.log(`     Window: ${Number(windowSec)}s (${Number(windowSec) / 60} min)`);
        console.log(`     Horizon: ${Number(horizonSec)}s (${Number(horizonSec) / 86400} days)`);
        console.log(`     Lambda Range: ${Number(lambdaMinBps) / 100}% - ${Number(lambdaMaxBps) / 100}%`);
        console.log(`     Reserve: ${Number(reserveBps) / 100}%`);
        console.log(`     Oracle: ${oracleSigner}`);
        
        console.log(`\n   Pool State:`);
        console.log(`     Total Liquidity: ${hre.ethers.formatEther(totalLiq)} C2FLR`);
        console.log(`     Outstanding: ${hre.ethers.formatEther(exposure)} C2FLR`);
        console.log(`     Utilization: ${(Number(utilization) / 100).toFixed(2)}%`);
        console.log(`     Current Lambda: ${(Number(lambda) / 100).toFixed(2)}%`);
        
        console.log(`\n   Explorer: https://coston2-explorer.flare.network/address/${marketAddress}`);
        console.log("─".repeat(80));
    }
    
    console.log(`\n💡 Interact with a market:`);
    console.log(`   MARKET_ADDRESS=<address> AMOUNT=100 npx hardhat run scripts/add-liquidity.js --network coston2`);
    console.log(`   MARKET_ADDRESS=<address> NOTIONAL=10 npx hardhat run scripts/buy-protection.js --network coston2`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
