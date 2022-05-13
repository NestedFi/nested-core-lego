//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

interface ICurvePool {
    function token() external view returns (address);

    function coins(uint256 index) external view returns (address);

    function add_liquidity(uint256[3] calldata amounts, uint256 min_mint_amount) external;

    function remove_liquidity_one_coin(
        uint256 _token_amount,
        int128 i,
        uint256 min_amount
    ) external;
}