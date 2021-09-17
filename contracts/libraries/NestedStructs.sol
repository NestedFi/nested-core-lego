// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

/// @title Library gathering structs used in Nested Finance
library NestedStructs {
    /// @dev Info about assets stored in reserves
    struct Holding {
        bytes32 operator;
        address token;
        uint256 amount;
        bool isActive;
    }

    /// @dev Store user asset informations
    struct NftRecord {
        mapping(address => NestedStructs.Holding) holdings;
        address[] tokens;
        address reserve;
    }

    /// @dev Data required for swapping a token
    struct TokenOrder {
        address token;
        bytes callData;
    }
}
