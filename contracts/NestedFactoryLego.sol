// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/INestedFactoryLego.sol";
import "./interfaces/IOperatorSelector.sol";
import "./libraries/ExchangeHelpers.sol";
import "./NestedAsset.sol";
import "./interfaces/IWETH.sol";
import "./MixinOperatorResolver.sol";
import "./NestedReserve.sol";
import "./interfaces/MinimalSmartChef.sol";
import "./NestedRecords.sol";
import "./FeeSplitter.sol";

/// @title Creates, updates and destroys NestedAssets.
/// @notice Responsible for the business logic of the protocol and interaction with operators
contract NestedFactoryLego is INestedFactoryLego, ReentrancyGuard, Ownable, MixinOperatorResolver {
    using SafeERC20 for IERC20;
    address private constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    uint256 public vipDiscount;
    uint256 public vipMinAmount;

    /// @dev Yield farming contract
    MinimalSmartChef public smartChef;

    /// @dev Current feeSplitter contract/address
    FeeSplitter public feeSplitter;

    /// @dev Current reserve contract/address
    NestedReserve public reserve;

    NestedAsset public immutable nestedAsset;
    IWETH public immutable weth;
    NestedRecords public immutable nestedRecords;

    bytes32[] private operators;

    constructor(
        NestedAsset _nestedAsset,
        NestedRecords _nestedRecords,
        IWETH _weth,
        address _operatorResolver,
        uint256 _vipDiscount,
        uint256 _vipMinAmount
    ) MixinOperatorResolver(_operatorResolver) {
        nestedAsset = _nestedAsset;
        nestedRecords = _nestedRecords;
        weth = _weth;
        vipDiscount = _vipDiscount;
        vipMinAmount = _vipMinAmount;
    }

    /// @dev Reverts the transaction if the caller is not the token owner
    /// @param _nftId uint256 the NFT Id
    modifier onlyTokenOwner(uint256 _nftId) {
        require(nestedAsset.ownerOf(_nftId) == msg.sender, "NestedFactory: Not the token owner");
        _;
    }

    /// @dev Receive function
    receive() external payable {}

    /// @notice Get the required operator addresses
    function resolverAddressesRequired() public view override returns (bytes32[] memory addresses) {
        return operators;
    }

    /// @notice Add an operator (name) for building cache
    /// @param operator The operator name to add
    function addOperator(bytes32 operator) external onlyOwner {
        operators.push(operator);
    }

    /// @notice Update the SmartChef contract address
    /// @param _smartChef New SmartChef address
    function updateSmartChef(address _smartChef) external onlyOwner {
        require(_smartChef != address(0), "NestedFactory::updateSmartChef: Invalid smartchef address");
        smartChef = MinimalSmartChef(_smartChef);
        emit SmartChefUpdated(_smartChef);
    }

    /// @notice Sets the reserve where the funds are stored
    /// @param _reserve the address of the new reserve
    function setReserve(NestedReserve _reserve) external onlyOwner {
        require(address(reserve) == address(0), "NestedFactory::setReserve: Reserve is immutable");
        reserve = _reserve;
    }

    /// @notice Update the VIP discount and min staked amount to be a VIP
    /// @param _vipDiscount [uint256] the fee discount to apply to a VIP user
    /// @param _vipMinAmount [uint256] min amount that needs to be staked to be a VIP
    function updateVipDiscount(uint256 _vipDiscount, uint256 _vipMinAmount) external onlyOwner {
        require(_vipDiscount < 1000, "NestedFactory::updateVipDiscount: Discount too high");
        (vipDiscount, vipMinAmount) = (_vipDiscount, _vipMinAmount);
        emit VipDiscountUpdated(vipDiscount, vipMinAmount);
    }

    /// @notice Create a portfolio and store the underlying assets from the positions
    /// @param _originalTokenId The id of the NFT replicated, 0 if not replicating
    /// @param _sellToken Token used to make the orders
    /// @param _sellTokenAmount Amount of sell tokens to use
    /// @param _orders Orders calldata
    function create(
        uint256 _originalTokenId,
        IERC20 _sellToken,
        uint256 _sellTokenAmount,
        Order[] calldata _orders
    ) external payable nonReentrant {
        require(_orders.length > 0, "NestedFactory::create: Missing orders");

        uint256 nftId = nestedAsset.mint(msg.sender, _originalTokenId);
        (uint256 fees, IERC20 tokenSold) = _submitInOrders(nftId, _sellToken, _sellTokenAmount, _orders, true, false);

        _transferFeeWithRoyalty(fees, tokenSold, nftId);
        emit NftCreated(nftId, _originalTokenId);
    }

    /// @notice Add or increase one position (or more) and update the NFT
    /// @param _nftId The id of the NFT to update
    /// @param _sellToken Token used to make the orders
    /// @param _sellTokenAmount Amount of sell tokens to use
    /// @param _orders Orders calldata
    function addTokens(
        uint256 _nftId,
        IERC20 _sellToken,
        uint256 _sellTokenAmount,
        Order[] calldata _orders
    ) external payable nonReentrant onlyTokenOwner(_nftId) {
        require(_orders.length > 0, "NestedFactory::addTokens: Missing orders");

        (uint256 fees, IERC20 tokenSold) = _submitInOrders(_nftId, _sellToken, _sellTokenAmount, _orders, true, false);
        _transferFee(fees, tokenSold);
        emit NftUpdated(_nftId);
    }

    /// @notice Use the output token of an existing position from
    /// the NFT for one or more positions.
    /// @param _nftId The id of the NFT to update
    /// @param _sellToken Token used to make the orders
    /// @param _sellTokenAmount Amount of sell tokens to use
    /// @param _orders Orders calldata
    function swapTokenForTokens(
        uint256 _nftId,
        IERC20 _sellToken,
        uint256 _sellTokenAmount,
        Order[] calldata _orders
    ) external payable nonReentrant onlyTokenOwner(_nftId) {
        require(_orders.length > 0, "NestedFactory::swapTokenForTokens: Missing orders");

        (uint256 fees, IERC20 tokenSold) = _submitInOrders(_nftId, _sellToken, _sellTokenAmount, _orders, true, true);
        _transferFee(fees, tokenSold);

        emit NftUpdated(_nftId);
    }

    /// @notice Use one or more existing tokens from the NFT for one position.
    /// @param _nftId The id of the NFT to update
    /// @param _buyToken The output token
    /// @param _sellTokensAmount The amount of sell tokens to use
    /// @param _orders Orders calldata
    function sellTokensToNft(
        uint256 _nftId,
        IERC20 _buyToken,
        uint256[] memory _sellTokensAmount,
        Order[] calldata _orders
    ) external payable nonReentrant onlyTokenOwner(_nftId) {
        require(_orders.length > 0, "NestedFactory::sellTokensToNft: Missing orders");
        require(_sellTokensAmount.length == _orders.length, "NestedFactory::sellTokensToNft: Input lengths must match");

        (uint256 feesAmount, IERC20 tokenSold) = _submitOutOrders(_nftId, _buyToken, _sellTokensAmount, _orders, true, true);
        _transferFeeWithRoyalty(feesAmount, tokenSold, _nftId);

        emit NftUpdated(_nftId);
    }

    /// @dev For every orders, call the operator with the calldata
    /// to submit buy orders (where the input is one asset).
    /// @param _nftId The id of the NFT impacted by the orders
    /// @param _inputToken Token used to make the orders
    /// @param _inputTokenAmount Amount of input tokens to use
    /// @param _orders Orders calldata
    /// @param _reserved True if the output is store in the reserve/records, false if not.
    /// @param _fromReserve True if the input tokens are from the reserve
    /// @return feesAmount The total amount of fees
    /// @return tokenSold The ERC20 token sold (in case of ETH to WETH)
    function _submitInOrders(
        uint256 _nftId,
        IERC20 _inputToken,
        uint256 _inputTokenAmount,
        Order[] calldata _orders,
        bool _reserved,
        bool _fromReserve
    ) internal returns (uint256 feesAmount, IERC20 tokenSold) {
        _inputToken = _transferInputTokens(_nftId, _inputToken, _inputTokenAmount, _fromReserve);

        uint256 amountSpent;
        for (uint256 i = 0; i < _orders.length; i++) {
            amountSpent += _submitOrder(_inputToken, _orders[i].token, _nftId, _orders[i], _reserved);
        }
        uint256 fees = _calculateFees(msg.sender, _inputTokenAmount);
        assert(amountSpent <= _inputTokenAmount - fees); // overspent

        // If input is from the reserve, update the records
        if (_fromReserve) {
            NestedStructs.Holding memory holding = nestedRecords.getAssetHolding(_nftId, address(_inputToken));
            nestedRecords.updateHoldingAmount(_nftId, address(_inputToken), holding.amount - _inputTokenAmount);
        }

        feesAmount = _inputTokenAmount - amountSpent;
        tokenSold = _inputToken;
    }

    /// @dev For every orders, call the operator with the calldata
    /// to submit sell orders (where the output is one asset).
    /// @param _nftId The id of the NFT impacted by the orders
    /// @param _outputToken Token received for every orders
    /// @param _inputTokenAmounts Amounts of tokens to use (respectively with Orders)
    /// @param _orders Orders calldata
    /// @param _reserved True if the output is store in the reserve/records, false if not.
    /// @param _fromReserve True if the input tokens are from the reserve
    /// @return feesAmount The total amount of fees
    /// @return tokenBought The ERC20 token bought
    function _submitOutOrders(
        uint256 _nftId,
        IERC20 _outputToken,
        uint256[] memory _inputTokenAmounts,
        Order[] calldata _orders,
        bool _reserved,
        bool _fromReserve
    ) internal returns (uint256 feesAmount, IERC20 tokenBought) {
        uint256 _outputTokenInitialBalance = _outputToken.balanceOf(address(this));

        for (uint256 i = 0; i < _orders.length; i++) {
            IERC20 _inputToken = _transferInputTokens(_nftId, IERC20(_orders[i].token), _inputTokenAmounts[i], _fromReserve);

            // Submit order and update holding of spent token
            uint256 amountSpent = _submitOrder(_inputToken, address(_outputToken), _nftId, _orders[i], _reserved);

            if (_fromReserve) {
                NestedStructs.Holding memory holding = nestedRecords.getAssetHolding(_nftId, address(_inputToken));
                nestedRecords.updateHoldingAmount(_nftId, address(_inputToken), holding.amount - amountSpent);
            }
        }
        uint256 amountBought = _outputToken.balanceOf(address(this)) - _outputTokenInitialBalance;

        feesAmount = _calculateFees(msg.sender, amountBought);
        tokenBought = _outputToken;
    }

    /// @dev Call the operator to submit the order (commit/revert) and add the output
    /// assets to the reserve (if needed).
    /// @param _inputToken Token used to make the orders
    /// @param _outputToken Expected output token
    /// @param _nftId The nftId
    /// @param _order The order calldata
    /// @param _reserved True if the output is store in the reserve/records, false if not.
    function _submitOrder(
        IERC20 _inputToken,
        address _outputToken,
        uint256 _nftId,
        Order calldata _order,
        bool _reserved
    ) internal returns (uint256 amountSpent) {
        address operator = requireAndGetAddress(_order.operator);
        uint256 balanceBeforePurchase = _inputToken.balanceOf(address(this));

        // The operator address needs to be the first parameter of the operator delegatecall.
        // We assume that the calldata given by the user are only the params, without the signature.
        // Parameters are concatenated and padded to 32 bytes.
        // We are concatenating the selector + operator address + given params
        bytes4 selector;
        if (_order.commit) {
            selector = IOperatorSelector(operator).getCommitSelector();
        } else {
            selector = IOperatorSelector(operator).getRevertSelector();
        }

        bytes memory safeCalldata = bytes.concat(selector, abi.encodePacked(operator), _order.callData);

        (bool success, bytes memory data) = operator.delegatecall(safeCalldata);
        require(success, "NestedFactory::_submitOrder: Operator call failed");

        // Get amounts and tokens from operator call
        (uint256[] memory amounts, address[] memory tokens) = abi.decode(data, (uint256[], address[]));
        require(tokens[0] == _outputToken, "NestedFactory::_submitOrder: Wrong output token in calldata");

        if (_reserved) {
            // Send output to reserve
            IERC20(_outputToken).safeTransfer(address(reserve), amounts[0]);

            // Store position
            nestedRecords.store(_nftId, _outputToken, amounts[0], address(reserve));
        }
        amountSpent = balanceBeforePurchase - _inputToken.balanceOf(address(this));
    }

    /// @dev Choose between ERC20 (safeTransfer) and ETH (deposit), to transfer from the Reserve
    ///      or the user wallet, to the factory.
    /// @param _nftId The NFT id
    /// @param _inputToken The token to receive
    /// @param _inputTokenAmount Amount to transfer
    /// @param _fromReserve True to transfer from the reserve
    /// @return tokenUsed Token transfered (in case of ETH)
    function _transferInputTokens(uint256 _nftId, IERC20 _inputToken, uint256 _inputTokenAmount, bool _fromReserve) internal returns (IERC20 tokenUsed) {
        if (_fromReserve) {
            NestedStructs.Holding memory holding = nestedRecords.getAssetHolding(_nftId, address(_inputToken));
            require(holding.amount >= _inputTokenAmount, "NestedFactory:_transferInputTokens: Insufficient amount");

            // Get input from reserve
            reserve.withdraw(IERC20(holding.token), _inputTokenAmount);
        } else if (address(_inputToken) == ETH) {
            require(msg.value >= _inputTokenAmount, "NestedFactory::_transferInputTokens: Insufficient amount in");
            weth.deposit{ value: msg.value }();
            _inputToken = IERC20(address(weth));
        } else {
            _inputToken.safeTransferFrom(msg.sender, address(this), _inputTokenAmount);
        }
        tokenUsed = _inputToken;
    }

    /// @dev Send a fee to the FeeSplitter, royalties will be paid to the owner of the original asset
    /// @param _amount Amount to send
    /// @param _token Token to send
    /// @param _nftId User portfolio ID used to find a potential royalties recipient
    function _transferFeeWithRoyalty(
        uint256 _amount,
        IERC20 _token,
        uint256 _nftId
    ) internal {
        address originalOwner = nestedAsset.originalOwner(_nftId);
        ExchangeHelpers.setMaxAllowance(_token, address(feeSplitter));
        if (originalOwner != address(0)) {
            feeSplitter.sendFeesWithRoyalties(originalOwner, _token, _amount);
        } else {
            feeSplitter.sendFees(_token, _amount);
        }
    }

    /// @dev Send a fee to the FeeSplitter
    /// @param _amount Amount to send
    /// @param _token Token to send
    function _transferFee(uint256 _amount, IERC20 _token) internal {
        ExchangeHelpers.setMaxAllowance(_token, address(feeSplitter));
        feeSplitter.sendFees(_token, _amount);
    }

    /// @dev Calculate the fees for a specific user and amount
    /// @param _user The user address
    /// @param _amount The amount
    /// @return The fees amount
    function _calculateFees(address _user, uint256 _amount) internal view returns (uint256) {
        uint256 baseFee = _amount / 100;
        uint256 feeWithDiscount = baseFee - _calculateDiscount(_user, baseFee);
        return feeWithDiscount;
    }

    /// @dev Calculates the discount for a VIP user
    /// @param _user User to check the VIP status of
    /// @param _amount Amount to calculate the discount on
    /// @return The discount amount
    function _calculateDiscount(address _user, uint256 _amount) internal view returns (uint256) {
        // give a discount to VIP users
        if (_isVIP(_user)) {
            return (_amount * vipDiscount) / 1000;
        } else {
            return 0;
        }
    }

    /// @dev Checks if a user is a VIP.
    /// User needs to have at least vipMinAmount of NST staked
    /// @param _account User address
    /// @return Boolean indicating if user is VIP
    function _isVIP(address _account) internal view returns (bool) {
        if (address(smartChef) == address(0)) {
            return false;
        }
        uint256 stakedNst = smartChef.userInfo(_account).amount;
        return stakedNst >= vipMinAmount;
    }
}
