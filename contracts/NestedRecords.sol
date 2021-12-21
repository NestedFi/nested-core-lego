// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import "./abstracts/OwnableFactoryHandler.sol";

/// @title Tracks data for underlying assets of NestedNFTs
contract NestedRecords is OwnableFactoryHandler {
    /// @dev Emitted when maxHoldingsCount is updated
    /// @param maxHoldingsCount The new value
    event MaxHoldingsChanges(uint256 maxHoldingsCount);

    /// @dev Emitted when the lock timestamp of an NFT is increased
    /// @param nftId The NFT ID
    /// @param timestamp The new lock timestamp of the portfolio
    event LockTimestampIncreased(uint256 nftId, uint256 timestamp);

    /// @dev Emitted when the reserve is updated for a specific portfolio
    /// @param nftId The NFT ID
    /// @param newReserve The new reserve address
    event reserveUpdated(uint256 nftId, address newReserve); 

    /// @dev Info about assets stored in reserves
    struct Holding {
        uint256 amount;
        address token;
        bool isActive;
    }

    /// @dev Store user asset informations
    struct NftRecord {
        mapping(address => Holding) holdings;
        address[] tokens;
        address reserve;
        uint256 lockTimestamp;
    }

    /// @dev stores for each NFT ID an asset record
    mapping(uint256 => NftRecord) public records;

    /// @dev The maximum number of holdings for an NFT record
    uint256 public maxHoldingsCount;

    constructor(uint256 _maxHoldingsCount) {
        maxHoldingsCount = _maxHoldingsCount;
    }

    /// @notice Update the amount for a specific holding and delete
    /// the holding if the amount is zero.
    /// @param _nftId The id of the NFT
    /// @param _token The token/holding address
    /// @param _amount Updated amount for this asset
    function updateHoldingAmount(
        uint256 _nftId,
        address _token,
        uint256 _amount
    ) public onlyFactory {
        if (_amount == 0) {
            uint256 tokenIndex = 0;
            address[] memory tokens = getAssetTokens(_nftId);
            while (tokenIndex < tokens.length) {
                if (tokens[tokenIndex] == _token) {
                    deleteAsset(_nftId, tokenIndex);
                    break;
                }
                tokenIndex++;
            }
        } else {
            records[_nftId].holdings[_token].amount = _amount;
        }
    }

    /// @notice Get content of assetTokens mapping
    /// @param _nftId The id of the NFT>
    function getAssetTokens(uint256 _nftId) public view returns (address[] memory) {
        return records[_nftId].tokens;
    }

    /// @notice Delete a holding item in holding mapping. Does not remove token in NftRecord.tokens array
    /// @param _nftId NFT's identifier
    /// @param _token Token address for holding to remove
    function freeHolding(uint256 _nftId, address _token) public onlyFactory {
        delete records[_nftId].holdings[_token];
    }

    /// @notice Helper function that creates a record or add the holding if record already exists
    /// @param _nftId The NFT's identifier
    /// @param _token The token/holding address
    /// @param _amount Amount to add for this asset
    /// @param _reserve Reserve address
    function store(
        uint256 _nftId,
        address _token,
        uint256 _amount,
        address _reserve
    ) external onlyFactory {
        Holding memory holding = records[_nftId].holdings[_token];
        if (holding.isActive) {
            require(records[_nftId].reserve == _reserve, "NRC: RESERVE_MISMATCH");
            updateHoldingAmount(_nftId, _token, holding.amount + _amount);
            return;
        }
        require(records[_nftId].tokens.length < maxHoldingsCount, "NRC: TOO_MANY_ORDERS");
        require(
            _reserve != address(0) && (_reserve == records[_nftId].reserve || records[_nftId].reserve == address(0)),
            "NRC: INVALID_RESERVE"
        );

        records[_nftId].holdings[_token] = Holding({ token: _token, amount: _amount, isActive: true });
        records[_nftId].tokens.push(_token);
        records[_nftId].reserve = _reserve;
    }

    /// @notice Get holding object for this NFT ID
    /// @param _nftId The id of the NFT
    /// @param _token The address of the token
    function getAssetHolding(uint256 _nftId, address _token) external view returns (Holding memory) {
        return records[_nftId].holdings[_token];
    }

    /// @notice The factory can update the lock timestamp of a NFT record
    /// The new timestamp must be greater than the records lockTimestamp
    //  if block.timestamp > actual lock timestamp
    /// @param _nftId The NFT id to get the record
    /// @param _timestamp The new timestamp
    function updateLockTimestamp(uint256 _nftId, uint256 _timestamp) external onlyFactory {
        require(_timestamp > records[_nftId].lockTimestamp, "NRC: LOCK_PERIOD_CANT_DECREASE");
        records[_nftId].lockTimestamp = _timestamp;
        emit LockTimestampIncreased(_nftId, _timestamp);
    }

    /// @notice Sets the maximum number of holdings for an NFT record
    /// @param _maxHoldingsCount The new maximum number of holdings
    function setMaxHoldingsCount(uint256 _maxHoldingsCount) external onlyOwner {
        require(_maxHoldingsCount != 0, "NRC: INVALID_MAX_HOLDINGS");
        maxHoldingsCount = _maxHoldingsCount;
        emit MaxHoldingsChanges(maxHoldingsCount);
    }

    /// @notice Get reserve the assets are stored in
    /// @param _nftId The NFT ID
    /// @return The reserve address these assets are stored in
    function getAssetReserve(uint256 _nftId) external view returns (address) {
        return records[_nftId].reserve;
    }

    /// @notice Get how many tokens are in a portfolio/NFT
    /// @param _nftId NFT ID to examine
    /// @return The array length
    function getAssetTokensLength(uint256 _nftId) external view returns (uint256) {
        return records[_nftId].tokens.length;
    }

    /// @notice Get the lock timestamp of a portfolio/NFT
    /// @param _nftId The NFT ID
    /// @return The lock timestamp from the NftRecord
    function getLockTimestamp(uint256 _nftId) external view returns (uint256) {
        return records[_nftId].lockTimestamp;
    }

    /// @notice Set the reserve where assets are stored
    /// @param _nftId The NFT ID to update
    /// @param _nextReserve Address for the new reserve
    function setReserve(uint256 _nftId, address _nextReserve) external onlyFactory {
        records[_nftId].reserve = _nextReserve;
        emit reserveUpdated(_nftId, _nextReserve);
    }

    /// @notice Delete from mapping assetTokens
    /// @param _nftId The id of the NFT
    function removeNFT(uint256 _nftId) external onlyFactory {
        delete records[_nftId];
    }

    /// @notice Fully delete a holding record for an NFT
    /// @param _nftId The id of the NFT
    /// @param _tokenIndex The token index in holdings array
    function deleteAsset(uint256 _nftId, uint256 _tokenIndex) public onlyFactory {
        address[] storage tokens = records[_nftId].tokens;
        address token = tokens[_tokenIndex];
        Holding memory holding = records[_nftId].holdings[token];

        require(holding.isActive, "NRC: HOLDING_INACTIVE");

        delete records[_nftId].holdings[token];
        tokens[_tokenIndex] = tokens[tokens.length - 1];
        tokens.pop();
    }
}