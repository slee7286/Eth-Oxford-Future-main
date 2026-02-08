// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./GasCapFutures.sol";

contract GasCapFuturesFactory {
    address[] public deployedFutures;
    mapping(address => address[]) public userFutures;

    event FuturesCreated(address indexed futuresAddress, string name, address indexed creator);

    function createFutures(
        uint256 _strikePrice,
        uint256 _expiryDuration,
        string memory _name,
        string memory _description
    ) external returns (address) {
        GasCapFutures futures = new GasCapFutures(_strikePrice, _expiryDuration, _name, _description);
        address addr = address(futures);
        deployedFutures.push(addr);
        userFutures[msg.sender].push(addr);
        emit FuturesCreated(addr, _name, msg.sender);
        return addr;
    }

    function getDeployedFutures() external view returns (address[] memory) {
        return deployedFutures;
    }

    function getDeployedCount() external view returns (uint256) {
        return deployedFutures.length;
    }
}
