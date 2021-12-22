// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.11;

import "./interfaces/IOperatorResolver.sol";
import "./MixinOperatorResolver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Operator Resolver implementation
/// @notice Resolve the operators address
contract OperatorResolver is IOperatorResolver, Ownable {
    /// @dev Operators map of the name and address
    mapping(bytes32 => address) public operators;

    /// @inheritdoc IOperatorResolver
    function getAddress(bytes32 name) external view override returns (address) {
        return operators[name];
    }

    /// @inheritdoc IOperatorResolver
    function requireAndGetAddress(bytes32 name, string calldata reason) external view override returns (address) {
        address _foundAddress = operators[name];
        require(_foundAddress != address(0), reason);
        return _foundAddress;
    }

    /// @inheritdoc IOperatorResolver
    function areAddressesImported(bytes32[] calldata names, address[] calldata destinations)
        external
        view
        override
        returns (bool)
    {
        uint256 namesLength = names.length;
        require(namesLength == destinations.length, "OR: INPUTS_LENGTH_MUST_MATCH");
        for (uint256 i = 0; i < namesLength; i++) {
            if (operators[names[i]] != destinations[i]) {
                return false;
            }
        }
        return true;
    }

    /// @inheritdoc IOperatorResolver
    function importOperators(
        bytes32[] calldata names,
        address[] calldata operatorAdrrs,
        MixinOperatorResolver[] calldata destinations
    ) external override onlyOwner {
        require(names.length == operatorAdrrs.length, "OR: INPUTS_LENGTH_MUST_MATCH");
        bytes32 name;
        address destination;
        for (uint256 i = 0; i < names.length; i++) {
            name = names[i];
            destination = operatorAdrrs[i];
            operators[name] = destination;
            emit OperatorImported(name, destination);
        }
        rebuildCaches(destinations);
    }

    /// @notice rebuild the caches of mixin smart contracts
    /// @param destinations The list of mixinOperatorResolver to rebuild
    function rebuildCaches(MixinOperatorResolver[] calldata destinations) public {
        for (uint256 i = 0; i < destinations.length; i++) {
            destinations[i].rebuildCache();
        }
    }
}
