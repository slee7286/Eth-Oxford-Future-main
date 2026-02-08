// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DepegProtectionMarket.sol";

/**
 * @title DepegProtectionFactory
 * @notice Deploys parametric depeg protection markets and keeps a registry
 */
contract DepegProtectionFactory {
    struct MarketInfo {
        address market;
        address creator;
        uint256 createdAt;
    }

    address public owner;
    MarketInfo[] public markets;

    event MarketCreated(
        address indexed market,
        address indexed creator,
        uint256 index,
        bytes32 feedId,
        uint256 barrierPpm,
        uint256 windowSec,
        uint256 horizonSec
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function marketsCount() external view returns (uint256) {
        return markets.length;
    }

    function getMarket(uint256 index)
        external
        view
        returns (address market, address creator, uint256 createdAt)
    {
        require(index < markets.length, "Index OOB");
        MarketInfo memory m = markets[index];
        return (m.market, m.creator, m.createdAt);
    }

    function getAllMarkets() external view returns (address[] memory list) {
        list = new address[](markets.length);
        for (uint256 i = 0; i < markets.length; i++) {
            list[i] = markets[i].market;
        }
    }

    /**
     * @notice Create a new market
     * @param feedSymbol e.g., "USDC-USD"
     * @param barrierPpm e.g., 985000 for 0.985 barrier (ppm = parts per million)
     * @param windowSec continuous time below barrier to trigger, e.g., 900 seconds
     * @param horizonSec product horizon for each policy (e.g., 7 days)
     * @param lambdaMinBps min risk loading in bps (e.g., 500 = 5%)
     * @param lambdaMaxBps max risk loading in bps (e.g., 2000 = 20%)
     * @param reserveFactorBps reserve factor (capacity), e.g., 7000 = 70%
     * @param maxPriceAgeSec max age for p-quote (e.g., 300 seconds)
     * @param oracleSigner address authorized to sign FDC attestations
     */
    function createMarket(
        string memory feedSymbol,
        uint256 barrierPpm,
        uint256 windowSec,
        uint256 horizonSec,
        uint256 lambdaMinBps,
        uint256 lambdaMaxBps,
        uint256 reserveFactorBps,
        uint256 maxPriceAgeSec,
        address oracleSigner
    ) external returns (address marketAddr, uint256 index) {
        DepegProtectionMarket m = new DepegProtectionMarket(
            feedSymbol,
            barrierPpm,
            windowSec,
            horizonSec,
            lambdaMinBps,
            lambdaMaxBps,
            reserveFactorBps,
            maxPriceAgeSec,
            oracleSigner
        );
        marketAddr = address(m);

        markets.push(MarketInfo({
            market: marketAddr,
            creator: msg.sender,
            createdAt: block.timestamp
        }));

        index = markets.length - 1;

        emit MarketCreated(
            marketAddr,
            msg.sender,
            index,
            m.feedId(),
            barrierPpm,
            windowSec,
            horizonSec
        );
    }
}