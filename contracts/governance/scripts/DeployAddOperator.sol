// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.11;

import "../../interfaces/INestedFactory.sol";
import "../../interfaces/IOperatorResolver.sol";
import "../../abstracts/MixinOperatorResolver.sol";

contract DeployAddOperator {
    struct tupleOperator {
        bytes32 name;
        bytes4 selector;
    }

    /// @notice Deploy and add operators
    /// @dev One address and multiple selectors/names
    /// @param nestedFactory The NestedFactory address
    /// @param bytecode Operator implementation bytecode
    /// @param operators Array of tuples => bytes32/bytes4 (name and selector)
    function deployAddOperator(
        address nestedFactory,
        bytes memory bytecode,
        tupleOperator[] memory operators
    ) external {
        require(nestedFactory != address(0), "DAO-SCRIPT: INVALID_FACTORY_ADDRESS");
        require(bytecode.length != 0, "DAO-SCRIPT: BYTECODE_ZERO");

        address deployedAddress;
        assembly {
            deployedAddress := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        require(deployedAddress != address(0), "DAO-SCRIPT: FAILED_DEPLOY");

        IOperatorResolver resolver = IOperatorResolver(MixinOperatorResolver(nestedFactory).resolver());

        // Init arrays
        uint256 operatorLength = operators.length;
        bytes32[] memory names = new bytes32[](operatorLength);
        IOperatorResolver.Operator[] memory operatorsToImport = new IOperatorResolver.Operator[](operatorLength);

        for (uint256 i; i < operatorLength; i++) {
            IOperatorResolver.Operator memory operator = IOperatorResolver.Operator(
                deployedAddress,
                operators[i].selector
            );
            names[i] = operators[i].name;
            operatorsToImport[i] = operator;
        }

        // Only the NestedFactory as destination
        MixinOperatorResolver[] memory destinations = new MixinOperatorResolver[](1);
        destinations[0] = MixinOperatorResolver(nestedFactory);

        // Start importing operators
        IOperatorResolver(resolver).importOperators(names, operatorsToImport, destinations);

        // Add all the operators to the factory
        for (uint256 i; i < operatorLength; i++) {
            INestedFactory(nestedFactory).addOperator(operators[i].name);
        }

        require(MixinOperatorResolver(nestedFactory).isResolverCached(), "DAO-SCRIPT: UNRESOLVED_CACHE");
    }
}
