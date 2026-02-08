// scripts/claim.js
const hre = require("hardhat");
const axios = require("axios");

async function main() {
    const marketAddress = process.env.MARKET_ADDRESS || process.argv[2];
    const policyId = process.env.POLICY_ID || process.argv[3];
    
    if (!marketAddress || !policyId) {
        console.error("❌ Please provide market address and policy ID:");
        console.error("   MARKET_ADDRESS=0x... POLICY_ID=1 npx hardhat run scripts/claim.js --network coston2");
        process.exit(1);
    }
    
    console.log("💰 Claiming Depeg Protection Payout\n");
    console.log("Market:", marketAddress);
    console.log("Policy ID:", policyId);
    
    const market = await hre.ethers.getContractAt("DepegProtectionMarket", marketAddress);
    const [claimant] = await hre.ethers.getSigners();
    
    console.log("Claimant:", claimant.address);
    
    // Get policy details
    const policy = await market.policies(policyId);
    
    if (policy.buyer !== claimant.address) {
        console.error("\n❌ You are not the policy buyer!");
        console.error("  Buyer:", policy.buyer);
        process.exit(1);
    }
    
    if (policy.claimed) {
        console.error("\n❌ Policy already claimed!");
        process.exit(1);
    }
    
    console.log("\n📋 Policy Details:");
    console.log("  Buyer:", policy.buyer);
    console.log("  Notional:", hre.ethers.formatEther(policy.notional), "C2FLR");
    console.log("  Premium Paid:", hre.ethers.formatEther(policy.premiumPaid), "C2FLR");
    console.log("  Start:", new Date(Number(policy.start) * 1000).toISOString());
    console.log("  Expiry:", new Date(Number(policy.expiry) * 1000).toISOString());
    
    // Get market config
    const config = await market.getConfig();
    const barrierPpm = config[1];
    const windowSec = config[2];
    
    // Get trigger attestation from oracle
    const oracleUrl = process.env.ORACLE_URL || "http://localhost:3000";
    const stablecoin = process.env.STABLECOIN || "USDC";
    
    console.log("\n🔮 Requesting trigger attestation from oracle...");
    
    let attestationResponse;
    try {
        attestationResponse = await axios.post(`${oracleUrl}/attestation/trigger`, {
            stablecoin,
            marketAddress,
            barrierPpm: Number(barrierPpm).toString(),
            windowSec: Number(windowSec).toString(),
            startTime: Number(policy.start).toString(),
            endTime: Number(policy.expiry).toString()
        });
    } catch (error) {
        console.error("\n❌ Failed to get attestation from oracle!");
        console.error("  Make sure oracle server is running:");
        console.error("  cd oracle && node server.js");
        throw error;
    }
    
    const attestation = attestationResponse.data.data;
    
    console.log("\n📊 Trigger Attestation:");
    console.log("  Triggered:", attestation.triggered === 1 ? "YES" : "NO");
    console.log("  Event Start:", new Date(attestation.eventStart * 1000).toISOString());
    console.log("  Event End:", new Date(attestation.eventEnd * 1000).toISOString());
    console.log("  Duration:", attestation.duration, "seconds");
    console.log("  Issued At:", new Date(attestation.issuedAt * 1000).toISOString());
    
    if (attestation.triggered === 0) {
        console.log("\n⚠️  Trigger condition not met!");
        console.log("  The stablecoin did not stay below the barrier for the required window.");
        console.log("  No payout available.");
        process.exit(0);
    }
    
    console.log("\n✅ Trigger condition MET! Claiming payout...");
    
    const initialBalance = await hre.ethers.provider.getBalance(claimant.address);
    
    console.log("\n⏳ Submitting claim...");
    const tx = await market.claim(
        policyId,
        attestation.eventStart,
        attestation.eventEnd,
        attestation.issuedAt,
        attestation.signature
    );
    
    console.log("📝 Transaction:", tx.hash);
    console.log("⏳ Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("✅ Confirmed in block:", receipt.blockNumber);
    
    const finalBalance = await hre.ethers.provider.getBalance(claimant.address);
    const payout = finalBalance - initialBalance;
    
    console.log("\n💰 Claim Successful!");
    console.log("  Payout:", hre.ethers.formatEther(policy.notional), "C2FLR");
    console.log("  Net Gain:", hre.ethers.formatEther(policy.notional - policy.premiumPaid), "C2FLR");
    console.log("  (Premium was:", hre.ethers.formatEther(policy.premiumPaid), "C2FLR)");
    
    console.log("\n📊 Balance Change:");
    console.log("  Before:", hre.ethers.formatEther(initialBalance), "C2FLR");
    console.log("  After:", hre.ethers.formatEther(finalBalance), "C2FLR");
    console.log("  Change:", hre.ethers.formatEther(payout), "C2FLR (includes gas)");
    
    console.log("\n🔗 View on Explorer:");
    console.log(`  https://coston2-explorer.flare.network/tx/${tx.hash}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
