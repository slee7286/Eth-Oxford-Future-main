
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";


/**
 * @title DepegProtectionMarket
 * @notice Parametric binary payout on stablecoin depeg using FDC-signed proofs
 *
 * Units:
 * - barrierPpm: 1_000_000 = 1.000 (par). Example: 985_000 = 0.985 barrier.
 * - probabilities in bps (1/10000). Example: pBps = 200 = 2%.
 * - risk loading in bps.
 * - native token used for liquidity, premiums, and payout.
 */
contract DepegProtectionMarket {
    using ECDSA for bytes32;

    // Immutable product parameters
    bytes32 public immutable feedId;         // keccak256(bytes(feedSymbol))
    uint256 public immutable barrierPpm;     // e.g., 985000
    uint256 public immutable windowSec;      // continuous below-barrier seconds
    uint256 public immutable horizonSec;     // policy horizon
    uint256 public immutable lambdaMinBps;   // min risk loading
    uint256 public immutable lambdaMaxBps;   // max risk loading
    uint256 public immutable reserveFactorBps;// capacity factor (e.g., 7000 = 70%)
    uint256 public immutable maxPriceAgeSec; // max age for p-quote

    address public owner;
    address public oracleSigner;             // authorized FDC signer

    // LP pool
    uint256 public totalLiquidity;
    mapping(address => uint256) public lpBalances;

    // Exposure tracking
    uint256 public outstandingExposure;      // sum of active policy notionals

    struct Policy {
        address buyer;
        uint256 notional;
        uint256 premiumPaid;
        uint256 start;
        uint256 expiry;
        bool claimed;
    }

    uint256 public nextPolicyId = 1;
    mapping(uint256 => Policy) public policies;

    event LiquidityAdded(address indexed lp, uint256 amount);
    event LiquidityRemoved(address indexed lp, uint256 amount);
    event OracleSignerUpdated(address signer);
    event PolicyBought(uint256 indexed id, address indexed buyer, uint256 notional, uint256 premium, uint256 start, uint256 expiry);
    event Claimed(uint256 indexed id, address indexed buyer, uint256 payout);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(
        string memory feedSymbol,
        uint256 _barrierPpm,
        uint256 _windowSec,
        uint256 _horizonSec,
        uint256 _lambdaMinBps,
        uint256 _lambdaMaxBps,
        uint256 _reserveFactorBps,
        uint256 _maxPriceAgeSec,
        address _oracleSigner
    ) {
        owner = msg.sender;
        feedId = keccak256(bytes(feedSymbol));
        barrierPpm = _barrierPpm;
        windowSec = _windowSec;
        horizonSec = _horizonSec;
        lambdaMinBps = _lambdaMinBps;
        lambdaMaxBps = _lambdaMaxBps;
        reserveFactorBps = _reserveFactorBps;
        maxPriceAgeSec = _maxPriceAgeSec;
        oracleSigner = _oracleSigner;
    }

    // --------- Admin ---------

    function setOracleSigner(address s) external onlyOwner {
        oracleSigner = s;
        emit OracleSignerUpdated(s);
    }

    // --------- Views ---------

    function utilizationBps() public view returns (uint256) {
        if (totalLiquidity == 0) return 0;
        return (outstandingExposure * 10000) / totalLiquidity;
    }

    function currentLambdaBps() public view returns (uint256) {
        if (lambdaMaxBps <= lambdaMinBps) return lambdaMinBps;
        uint256 u = utilizationBps();
        uint256 span = lambdaMaxBps - lambdaMinBps;
        return lambdaMinBps + (span * u) / 10000;
    }

    function quotePremium(uint256 notional, uint256 pBps) public view returns (uint256) {
        uint256 lambdaBps = currentLambdaBps();
        // Premium = notional * p * (1+lambda) ; p & lambda in bps → divide by 1e4 twice
        // = notional * pBps * (10000 + lambdaBps) / 1e8
        return (notional * pBps * (10000 + lambdaBps)) / 100000000;
    }

    function getConfig()
        external
        view
        returns (
            bytes32 _feedId,
            uint256 _barrierPpm,
            uint256 _windowSec,
            uint256 _horizonSec,
            uint256 _lambdaMinBps,
            uint256 _lambdaMaxBps,
            uint256 _reserveFactorBps,
            uint256 _maxPriceAgeSec,
            address _oracleSigner
        )
    {
        return (
            feedId,
            barrierPpm,
            windowSec,
            horizonSec,
            lambdaMinBps,
            lambdaMaxBps,
            reserveFactorBps,
            maxPriceAgeSec,
            oracleSigner
        );
    }

    // --------- Liquidity ---------

    function addLiquidity() external payable {
        require(msg.value > 0, "AMOUNT");
        lpBalances[msg.sender] += msg.value;
        totalLiquidity += msg.value;
        emit LiquidityAdded(msg.sender, msg.value);
    }

    function removeLiquidity(uint256 amount) external {
        uint256 lpBalance = lpBalances[msg.sender];
        require(lpBalance >= amount, "BAL"); // LP balance check

        uint256 minPool = (outstandingExposure * 10000) / reserveFactorBps;

        require(totalLiquidity >= minPool, "INSUFFICIENT_POOL"); // just sanity check

        uint256 excess = totalLiquidity > minPool ? totalLiquidity - minPool : 0;

        // Calculate LP's max withdrawable amount based on their share of excess liquidity
        uint256 maxWithdrawable = (lpBalance * excess) / totalLiquidity;

        require(amount <= maxWithdrawable, "WITHDRAW_LIMIT");

        // Update balances
        lpBalances[msg.sender] = lpBalance - amount;
        totalLiquidity -= amount;

        // Transfer native tokens
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "TRANSFER");

        emit LiquidityRemoved(msg.sender, amount);
    }

    // Your local toEthSignedMessageHash function:
    function toEthSignedMessageHash(bytes32 hash) internal pure returns (bytes32) {
        // 32 is the length in bytes of hash,
        // this mimics the behavior of eth_sign
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }
    // --------- Oracle digests (eth_sign) ---------

    // --------- Oracle digests (eth_sign) ---------

    function _probDigest(uint256 pBps, uint256 issuedAt) internal view returns (bytes32) {
        bytes32 preimage = keccak256(abi.encodePacked(
            "FDC:PROB_V1",
            address(this),
            block.chainid,
            feedId,
            horizonSec,
            pBps,
            issuedAt
        ));
        // Use your local function here:
        return toEthSignedMessageHash(preimage);
    }

    function _triggerDigest(
        uint256 eventStart,
        uint256 eventEnd,
        uint8 triggered,
        uint256 issuedAt
    ) internal view returns (bytes32) {
        bytes32 preimage = keccak256(abi.encodePacked(
            "FDC:TRIGGER_V1",
            address(this),
            block.chainid,
            feedId,
            barrierPpm,
            windowSec,
            eventStart,
            eventEnd,
            triggered,
            issuedAt
        ));
        // Use your local function here:
        return toEthSignedMessageHash(preimage);
    }

    // --------- Buy & Claim ---------

    /**
     * @param notional protection notional (payout if triggered)
     * @param pBps probability in bps from oracle attestation (for horizonSec)
     * @param issuedAt timestamp when oracle signed pBps
     * @param sig oracle signature (eth_sign over _probDigest)
     */
    function buyProtection(
        uint256 notional,
        uint256 pBps,
        uint256 issuedAt,
        bytes calldata sig
    ) external payable {
        require(notional > 0, "NOTIONAL");
        require(oracleSigner != address(0), "NO_SIGNER");
        require(block.timestamp >= issuedAt, "BAD_TIME");
        require(block.timestamp - issuedAt <= maxPriceAgeSec, "STALE_P");

        // Verify oracle signature
        bytes32 digest = _probDigest(pBps, issuedAt);
        address signer = ECDSA.recover(digest, sig);
        require(signer == oracleSigner, "BAD_SIG");

        // Capacity check
        require(reserveFactorBps > 0, "RES");
        require(totalLiquidity > 0, "NO_LIQ");
        uint256 newExposure = outstandingExposure + notional;
        uint256 cap = (totalLiquidity * reserveFactorBps) / 10000;
        require(newExposure <= cap, "CAPACITY");

        uint256 premium = quotePremium(notional, pBps);
        require(msg.value == premium, "PREMIUM");

        uint256 id = nextPolicyId++;
        policies[id] = Policy({
            buyer: msg.sender,
            notional: notional,
            premiumPaid: premium,
            start: block.timestamp,
            expiry: block.timestamp + horizonSec,
            claimed: false
        });
        outstandingExposure = newExposure;

        emit PolicyBought(id, msg.sender, notional, premium, block.timestamp, block.timestamp + horizonSec);
    }

    /**
     * @notice Claim payout after a trigger attestation
     * @param policyId your policy
     * @param eventStart inclusive start of below-barrier run
     * @param eventEnd exclusive end of run (>= eventStart + windowSec)
     * @param issuedAt oracle signature timestamp
     * @param sig oracle signature (eth_sign over _triggerDigest; triggered=1)
     */
    function claim(
        uint256 policyId,
        uint256 eventStart,
        uint256 eventEnd,
        uint256 issuedAt,
        bytes calldata sig
    ) external {
        Policy storage p = policies[policyId];
        require(p.buyer == msg.sender, "NOT_BUYER");
        require(!p.claimed, "CLAIMED");
        require(eventStart >= p.start && eventStart <= p.expiry, "OUT_WINDOW");
        require(eventEnd >= eventStart + windowSec, "BAD_RUN");
        require(block.timestamp >= eventEnd, "WAIT_END"); // ensure run completed
        require(block.timestamp - issuedAt <= 1 days, "STALE_TRIG");

        // Verify trigger signature
        bytes32 digest = _triggerDigest(eventStart, eventEnd, 1, issuedAt);
        address signer = ECDSA.recover(digest, sig);
        require(signer == oracleSigner, "BAD_SIG");

        // Payout
        p.claimed = true;
        outstandingExposure -= p.notional;
        require(address(this).balance >= p.notional, "INSOLVENT");

        (bool ok, ) = p.buyer.call{value: p.notional}("");
        require(ok, "PAY_FAIL");
        emit Claimed(policyId, p.buyer, p.notional);
    }

    receive() external payable {}
}