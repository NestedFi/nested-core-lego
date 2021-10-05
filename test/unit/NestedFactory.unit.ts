import { LoadFixtureFunction } from "../types";
import { factoryAndZeroExFixture, FactoryAndZeroExFixture } from "../shared/fixtures";
import { createFixtureLoader, expect, provider } from "../shared/provider";
import { BigNumber, Wallet } from "ethers";
import { appendDecimals, toBytes32 } from "../helpers";
import { ethers, network } from "hardhat";

let loadFixture: LoadFixtureFunction;

interface ZeroExOrder {
    operator: string;
    token: string;
    callData: string | [];
    commit: boolean;
}

describe("NestedFactory", () => {
    let context: FactoryAndZeroExFixture;
    const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    const abiCoder = new ethers.utils.AbiCoder();

    // Selector of "function dummyswapToken(address,address,uint)" of the DummyRouter
    const dummyRouterSelector = "0x76ab33a6";

    before("loader", async () => {
        loadFixture = createFixtureLoader(provider.getWallets(), provider);
    });

    beforeEach("create fixture loader", async () => {
        context = await loadFixture(factoryAndZeroExFixture);
    });

    it("deploys and has an address", async () => {
        expect(context.nestedFactory.address).to.be.a.string;
    });

    describe("constructor()", () => {
        it("sets the state variables", async () => {
            expect(await context.nestedFactory.feeSplitter()).to.eq(context.feeSplitter.address);
            expect(await context.nestedFactory.nestedAsset()).to.eq(context.nestedAsset.address);
            expect(await context.nestedFactory.nestedRecords()).to.eq(context.nestedRecords.address);
            expect(await context.nestedFactory.weth()).to.eq(context.WETH.address);
            expect(await context.nestedFactory.resolver()).to.eq(context.operatorResolver.address);
        });
    });

    describe("addOperator()", () => {
        it("cant be invoked by an user", async () => {
            await expect(
                context.nestedFactory.connect(context.user1).addOperator(toBytes32("test")),
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
        it("add a new operator", async () => {
            // Add the operator named "test"
            await context.nestedFactory.connect(context.masterDeployer).addOperator(toBytes32("test"));

            // Get the operators from the factory
            const operators = await context.nestedFactory.resolverAddressesRequired();

            // Must have 2 operators ("ZeroEx" from Fixture and "test")
            expect(operators.length).to.be.equal(2);
            expect(operators[0]).to.be.equal(toBytes32("ZeroEx"));
            expect(operators[1]).to.be.equal(toBytes32("test"));
        });
    });

    describe("updateSmartChef()", () => {
        const newSmartChef = Wallet.createRandom().address;
        it("cant be invoked by an user", async () => {
            await expect(context.nestedFactory.connect(context.user1).updateSmartChef(newSmartChef)).to.be.revertedWith(
                "Ownable: caller is not the owner",
            );
        });

        it("cant set zero address", async () => {
            await expect(
                context.nestedFactory.connect(context.masterDeployer).updateSmartChef(ethers.constants.AddressZero),
            ).to.be.revertedWith("NestedFactory::updateSmartChef: Invalid smartchef address");
        });

        it("set value", async () => {
            await context.nestedFactory.connect(context.masterDeployer).updateSmartChef(newSmartChef);
            expect(await context.nestedFactory.smartChef()).to.be.equal(newSmartChef);
        });

        it("emit SmartChefUpdated event", async () => {
            await expect(context.nestedFactory.connect(context.masterDeployer).updateSmartChef(newSmartChef))
                .to.emit(context.nestedFactory, "SmartChefUpdated")
                .withArgs(newSmartChef);
        });
    });

    describe("setReserve()", () => {
        const newReserve = Wallet.createRandom().address;
        it("cant be invoked by an user", async () => {
            await expect(context.nestedFactory.connect(context.user1).setReserve(newReserve)).to.be.revertedWith(
                "Ownable: caller is not the owner",
            );
        });

        it("cant set address (immutable)", async () => {
            await context.nestedFactory.connect(context.masterDeployer).setReserve(context.nestedReserve.address);
            await expect(
                context.nestedFactory.connect(context.masterDeployer).setReserve(newReserve),
            ).to.be.revertedWith("NestedFactory::setReserve: Reserve is immutable");
        });

        it("set value", async () => {
            await context.nestedFactory.connect(context.masterDeployer).setReserve(context.nestedReserve.address);
            expect(await context.nestedFactory.reserve()).to.be.equal(context.nestedReserve.address);
        });

        it("emit ReserveUpdated event", async () => {
            await expect(context.nestedFactory.connect(context.masterDeployer).setReserve(newReserve))
                .to.emit(context.nestedFactory, "ReserveUpdated")
                .withArgs(newReserve);
        });
    });

    describe("setFeeSplitter()", () => {
        const newFeeSplitter = Wallet.createRandom().address;
        it("cant be invoked by an user", async () => {
            await expect(
                context.nestedFactory.connect(context.user1).setFeeSplitter(newFeeSplitter),
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("cant set zero address", async () => {
            await expect(
                context.nestedFactory.connect(context.masterDeployer).setFeeSplitter(ethers.constants.AddressZero),
            ).to.be.revertedWith("NestedFactory::setFeeSplitter: Invalid feeSplitter address");
        });

        it("set value", async () => {
            await context.nestedFactory.connect(context.masterDeployer).setFeeSplitter(newFeeSplitter);
            expect(await context.nestedFactory.feeSplitter()).to.be.equal(newFeeSplitter);
        });

        it("emit FeeSplitterUpdated event", async () => {
            await expect(context.nestedFactory.connect(context.masterDeployer).setFeeSplitter(newFeeSplitter))
                .to.emit(context.nestedFactory, "FeeSplitterUpdated")
                .withArgs(newFeeSplitter);
        });
    });

    describe("updateVipDiscount()", () => {
        it("cant be invoked by an user", async () => {
            await expect(context.nestedFactory.connect(context.user1).updateVipDiscount(0, 0)).to.be.revertedWith(
                "Ownable: caller is not the owner",
            );
        });

        it("cant set vipDiscount greater than 999", async () => {
            await expect(
                context.nestedFactory.connect(context.masterDeployer).updateVipDiscount(1001, 0),
            ).to.be.revertedWith("NestedFactory::updateVipDiscount: Discount too high");
        });

        it("set values", async () => {
            await context.nestedFactory.connect(context.masterDeployer).updateVipDiscount(200, 100);
            expect(await context.nestedFactory.vipDiscount()).to.be.equal(200);
            expect(await context.nestedFactory.vipMinAmount()).to.be.equal(100);
        });

        it("emit VipDiscountUpdated event", async () => {
            await expect(context.nestedFactory.connect(context.masterDeployer).updateVipDiscount(200, 100))
                .to.emit(context.nestedFactory, "VipDiscountUpdated")
                .withArgs(200, 100);
        });
    });

    describe("create()", () => {
        beforeEach("Set reserve", async () => {
            await context.nestedFactory.connect(context.masterDeployer).setReserve(context.nestedReserve.address);
        });

        it("reverts if Orders list is empty", async () => {
            let orders: ZeroExOrder[] = [];
            await expect(
                context.nestedFactory.connect(context.user1).create(0, context.mockDAI.address, 0, orders),
            ).to.be.revertedWith("NestedFactory::create: Missing orders");
        });

        it("reverts if bad calldatas", async () => {
            // All the amounts for this test
            const uniBought = appendDecimals(10);
            const expectedFee = getExpectedFees(uniBought);
            const totalToSpend = uniBought.add(expectedFee);

            // Orders to buy UNI but the sellToken param (ZeroExOperator) is removed
            const orders: ZeroExOrder[] = [
                {
                    operator: toBytes32("ZeroEx"),
                    token: context.mockUNI.address,
                    callData: abiCoder.encode(
                        ["address", "bytes4", "bytes"],
                        [
                            context.mockUNI.address,
                            dummyRouterSelector,
                            abiCoder.encode(
                                ["address", "address", "uint"],
                                [context.mockDAI.address, context.mockUNI.address, uniBought],
                            ),
                        ],
                    ),
                    commit: true,
                },
            ];

            await expect(
                context.nestedFactory.connect(context.user1).create(0, context.mockDAI.address, totalToSpend, orders),
            ).to.be.revertedWith("NestedFactory::_submitOrder: Operator call failed");
        });

        it("reverts if wrong output token in calldata", async () => {
            // All the amounts for this test
            const uniBought = appendDecimals(10);
            const expectedFee = getExpectedFees(uniBought);
            const totalToSpend = uniBought.add(expectedFee);

            // Orders to buy UNI but the sellToken param (ZeroExOperator) is removed
            const orders: ZeroExOrder[] = [
                {
                    operator: toBytes32("ZeroEx"),
                    token: context.mockUNI.address,
                    callData: abiCoder.encode(
                        ["address", "address", "bytes4", "bytes"],
                        [
                            context.mockDAI.address,
                            context.mockKNC.address,
                            dummyRouterSelector,
                            abiCoder.encode(
                                ["address", "address", "uint"],
                                [context.mockDAI.address, context.mockKNC.address, uniBought],
                            ),
                        ],
                    ),
                    commit: true,
                },
            ];

            await expect(
                context.nestedFactory.connect(context.user1).create(0, context.mockDAI.address, totalToSpend, orders),
            ).to.be.revertedWith("NestedFactory::_submitOrder: Wrong output token in calldata");
        });

        it("reverts if the DAI amount is less than total sum of DAI sales", async () => {
            /*
             * All the amounts for this test :
             * - Buy 6 UNI and 4 KNC
             * - The user needs 10 DAI (+ fees) but will spend 5 DAI
             */
            const uniBought = appendDecimals(6);
            const kncBought = appendDecimals(4);
            const totalToSpend = appendDecimals(5);

            // Orders for UNI and KNC
            let orders: ZeroExOrder[] = getUniAndKncWithDaiOrders(uniBought, kncBought);

            // Revert because not enough funds to swap, the order amounts > totalToSpend
            await expect(
                context.nestedFactory.connect(context.user1).create(0, context.mockDAI.address, totalToSpend, orders),
            ).to.be.revertedWith("NestedFactory::_submitOrder: Operator call failed");
        });

        it("reverts if not enough to pay fees", async () => {
            /*
             * All the amounts for this test :
             * - Buy 6 UNI and 4 KNC
             * - The user needs 10 DAI (+ fees) but will spend 10 DAI => without the fees
             */
            const uniBought = appendDecimals(6);
            const kncBought = appendDecimals(4);
            const totalToSpend = appendDecimals(10);

            // Orders for UNI and KNC
            let orders: ZeroExOrder[] = getUniAndKncWithDaiOrders(uniBought, kncBought);

            // Should revert with "assert" (no message)
            await expect(
                context.nestedFactory.connect(context.user1).create(0, context.mockDAI.address, totalToSpend, orders),
            ).to.be.reverted;
        });

        it("reverts if the ETH amount is less than total sum of ETH sales", async () => {
            /*
             * All the amounts for this test :
             * - Buy 6 UNI and 4 KNC
             * - The user needs 10 ETH (+ fees) but will spend 5 ETH
             */
            const uniBought = appendDecimals(6);
            const kncBought = appendDecimals(4);
            const totalToSpend = appendDecimals(5);

            // Orders for UNI and KNC
            let orders: ZeroExOrder[] = getUniAndKncWithETHOrders(uniBought, kncBought);

            // Should revert with "assert" (no message)
            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .create(0, ETH, totalToSpend, orders, { value: totalToSpend }),
            ).to.be.reverted;
        });

        it("Creates NFT from DAI with KNI and UNI inside (ZeroExOperator) with right amounts", async () => {
            // All the amounts for this test
            const uniBought = appendDecimals(6);
            const kncBought = appendDecimals(4);
            const totalToBought = uniBought.add(kncBought);
            const expectedFee = getExpectedFees(totalToBought);
            const totalToSpend = totalToBought.add(expectedFee);

            // Orders for UNI and KNC
            let orders: ZeroExOrder[] = getUniAndKncWithDaiOrders(uniBought, kncBought);

            // User1 creates the portfolio/NFT and emit event NftCreated
            await expect(
                context.nestedFactory.connect(context.user1).create(0, context.mockDAI.address, totalToSpend, orders),
            )
                .to.emit(context.nestedFactory, "NftCreated")
                .withArgs(1, 0);

            // User1 must be the owner of NFT n°1
            expect(await context.nestedAsset.ownerOf(1)).to.be.equal(context.user1.address);

            // 6 UNI and 4 KNC must be in the reserve
            expect(await context.mockUNI.balanceOf(context.nestedReserve.address)).to.be.equal(uniBought);
            expect(await context.mockKNC.balanceOf(context.nestedReserve.address)).to.be.equal(kncBought);

            /*
             * User1 must have the right DAI amount :
             * baseAmount - amount spent
             */
            expect(await context.mockDAI.balanceOf(context.user1.address)).to.be.equal(
                context.baseAmount.sub(totalToSpend),
            );

            // The FeeSplitter must receive the right fee amount
            expect(await context.mockDAI.balanceOf(context.feeSplitter.address)).to.be.equal(expectedFee);

            // Must store UNI and KNC in the records of the NFT
            expect(await context.nestedRecords.getAssetTokens(1).then(value => value.toString())).to.be.equal(
                [context.mockUNI.address, context.mockKNC.address].toString(),
            );

            // Must have the right amount in the holdings
            const holdingsUNI = await context.nestedRecords.getAssetHolding(1, context.mockUNI.address);
            expect(holdingsUNI.token).to.be.equal(context.mockUNI.address);
            expect(holdingsUNI.amount).to.be.equal(uniBought);
            const holdingsKNC = await context.nestedRecords.getAssetHolding(1, context.mockKNC.address);
            expect(holdingsKNC.token).to.be.equal(context.mockKNC.address);
            expect(holdingsKNC.amount).to.be.equal(kncBought);
        });

        it("Creates NFT from DAI with KNI and UNI inside (ZeroExOperator) with more than needed", async () => {
            /*
             * All the amounts for this test :
             * - Buy 6 UNI and 4 KNC
             * - The user needs 10 DAI (+ fees) but will spend 20 DAI (10 DAI in excess)
             */
            const uniBought = appendDecimals(6);
            const kncBought = appendDecimals(4);
            const totalToBought = uniBought.add(kncBought);
            const totalToSpend = appendDecimals(20);

            // Orders for UNI and KNC
            let orders: ZeroExOrder[] = getUniAndKncWithDaiOrders(uniBought, kncBought);

            // User1 creates the portfolio/NFT and emit event NftCreated
            await expect(
                context.nestedFactory.connect(context.user1).create(0, context.mockDAI.address, totalToSpend, orders),
            )
                .to.emit(context.nestedFactory, "NftCreated")
                .withArgs(1, 0);

            // The FeeSplitter must receive the DAI in excess
            expect(await context.mockDAI.balanceOf(context.feeSplitter.address)).to.be.equal(
                totalToSpend.sub(totalToBought),
            );
        });

        it("Creates NFT from ETH with KNI and UNI inside (ZeroExOperator) with right amounts", async () => {
            // All the amounts for this test
            const uniBought = appendDecimals(6);
            const kncBought = appendDecimals(4);
            const totalToBought = uniBought.add(kncBought);
            const expectedFee = getExpectedFees(totalToBought);
            const totalToSpend = totalToBought.add(expectedFee);

            const ethBalanceBefore = await context.user1.getBalance();

            // Orders for UNI and KNC
            let orders: ZeroExOrder[] = getUniAndKncWithETHOrders(uniBought, kncBought);

            // User1 creates the portfolio/NFT
            const tx = await context.nestedFactory
                .connect(context.user1)
                .create(0, ETH, totalToSpend, orders, { value: totalToSpend });

            // Get the transaction fees
            const gasPrice = tx.gasPrice;
            const txFees = await tx.wait().then(value => value.gasUsed.mul(gasPrice));

            // User1 must be the owner of NFT n°1
            expect(await context.nestedAsset.ownerOf(1)).to.be.equal(context.user1.address);

            // 6 UNI and 4 KNC must be in the reserve
            expect(await context.mockUNI.balanceOf(context.nestedReserve.address)).to.be.equal(uniBought);
            expect(await context.mockKNC.balanceOf(context.nestedReserve.address)).to.be.equal(kncBought);

            /*
             * User1 must have the right ETH amount :
             * baseAmount - amount spent - transation fees
             */
            expect(await context.user1.getBalance()).to.be.equal(ethBalanceBefore.sub(totalToSpend).sub(txFees));

            // The FeeSplitter must receive the right fee amount
            expect(await context.WETH.balanceOf(context.feeSplitter.address)).to.be.equal(expectedFee);
        });
    });

    describe("addTokens()", () => {
        // Amount already in the portfolio
        let baseUniBought = appendDecimals(6);
        let baseKncBought = appendDecimals(4);
        let baseTotalToBought = baseUniBought.add(baseKncBought);
        let baseExpectedFee = getExpectedFees(baseTotalToBought);
        let baseTotalToSpend = baseTotalToBought.add(baseExpectedFee);

        beforeEach("Set reserve and create NFT (id 1)", async () => {
            // set reserve
            await context.nestedFactory.connect(context.masterDeployer).setReserve(context.nestedReserve.address);

            // create nft 1 with UNI and KNC from DAI (use the base amounts)
            let orders: ZeroExOrder[] = getUniAndKncWithDaiOrders(baseUniBought, baseKncBought);
            await context.nestedFactory
                .connect(context.user1)
                .create(0, context.mockDAI.address, baseTotalToSpend, orders);
        });

        it("reverts if Orders list is empty", async () => {
            let orders: ZeroExOrder[] = [];
            await expect(
                context.nestedFactory.connect(context.user1).addTokens(1, context.mockDAI.address, 0, orders),
            ).to.be.revertedWith("NestedFactory::addTokens: Missing orders");
        });

        it("reverts if bad calldatas", async () => {
            // All the amounts for this test
            const uniBought = appendDecimals(10);
            const expectedFee = getExpectedFees(uniBought);
            const totalToSpend = uniBought.add(expectedFee);

            // Orders to buy UNI but the sellToken param (ZeroExOperator) is removed
            const orders: ZeroExOrder[] = [
                {
                    operator: toBytes32("ZeroEx"),
                    token: context.mockUNI.address,
                    callData: abiCoder.encode(
                        ["address", "bytes4", "bytes"],
                        [
                            context.mockUNI.address,
                            dummyRouterSelector,
                            abiCoder.encode(
                                ["address", "address", "uint"],
                                [context.mockDAI.address, context.mockUNI.address, uniBought],
                            ),
                        ],
                    ),
                    commit: true,
                },
            ];

            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .addTokens(1, context.mockDAI.address, totalToSpend, orders),
            ).to.be.revertedWith("NestedFactory::_submitOrder: Operator call failed");
        });

        it("cant add tokens to nonexistent portfolio", async () => {
            // Amounts and Orders must be good
            const uniBought = appendDecimals(6);
            const kncBought = appendDecimals(4);
            const totalToBought = uniBought.add(kncBought);
            const expectedFee = getExpectedFees(totalToBought);
            const totalToSpend = totalToBought.add(expectedFee);
            let orders: ZeroExOrder[] = getUniAndKncWithDaiOrders(uniBought, kncBought);

            // NFT with id = 2 shouldn't exist
            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .addTokens(2, context.mockDAI.address, totalToSpend, orders),
            ).to.be.revertedWith("ERC721: owner query for nonexistent token");
        });

        it("cant add tokens to another user portfolio", async () => {
            // Amounts and Orders must be good
            const uniBought = appendDecimals(6);
            const kncBought = appendDecimals(4);
            const totalToBought = uniBought.add(kncBought);
            const expectedFee = getExpectedFees(totalToBought);
            const totalToSpend = totalToBought.add(expectedFee);
            let orders: ZeroExOrder[] = getUniAndKncWithDaiOrders(uniBought, kncBought);

            // Master Deployer is not the owner of NFT 1
            await expect(
                context.nestedFactory
                    .connect(context.masterDeployer)
                    .addTokens(1, context.mockDAI.address, totalToSpend, orders),
            ).to.be.revertedWith("NestedFactory: Not the token owner");
        });

        it("reverts if wrong output token in calldata", async () => {
            // All the amounts for this test
            const uniBought = appendDecimals(10);
            const expectedFee = getExpectedFees(uniBought);
            const totalToSpend = uniBought.add(expectedFee);

            // Orders to buy UNI but the sellToken param (ZeroExOperator) is removed
            const orders: ZeroExOrder[] = [
                {
                    operator: toBytes32("ZeroEx"),
                    token: context.mockUNI.address,
                    callData: abiCoder.encode(
                        ["address", "address", "bytes4", "bytes"],
                        [
                            context.mockDAI.address,
                            context.mockKNC.address,
                            dummyRouterSelector,
                            abiCoder.encode(
                                ["address", "address", "uint"],
                                [context.mockDAI.address, context.mockKNC.address, uniBought],
                            ),
                        ],
                    ),
                    commit: true,
                },
            ];

            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .addTokens(1, context.mockDAI.address, totalToSpend, orders),
            ).to.be.revertedWith("NestedFactory::_submitOrder: Wrong output token in calldata");
        });

        it("reverts if the DAI amount is less than total sum of DAI sales", async () => {
            /*
             * All the amounts for this test :
             * - Buy 6 UNI and 4 KNC
             * - The user needs 10 DAI (+ fees) but will spend 5 DAI
             */
            const uniBought = appendDecimals(6);
            const kncBought = appendDecimals(4);
            const totalToSpend = appendDecimals(5);

            // Orders for UNI and KNC
            let orders: ZeroExOrder[] = getUniAndKncWithDaiOrders(uniBought, kncBought);

            // Should revert with "assert" (no message)
            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .addTokens(1, context.mockDAI.address, totalToSpend, orders),
            ).to.be.reverted;
        });

        it("reverts if the ETH amount is less than total sum of ETH sales", async () => {
            /*
             * All the amounts for this test :
             * - Buy 6 UNI and 4 KNC
             * - The user needs 10 ETH (+ fees) but will spend 5 ETH
             */
            const uniBought = appendDecimals(6);
            const kncBought = appendDecimals(4);
            const totalToSpend = appendDecimals(5);

            // Orders for UNI and KNC
            let orders: ZeroExOrder[] = getUniAndKncWithETHOrders(uniBought, kncBought);

            // Should revert with "assert" (no message)
            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .addTokens(1, context.mockDAI.address, totalToSpend, orders, { value: totalToSpend }),
            ).to.be.reverted;
        });

        it("increase KNI and UNI amount from DAI (ZeroExOperator) with right amounts", async () => {
            // All the amounts for this test
            const uniBought = appendDecimals(6);
            const kncBought = appendDecimals(4);
            const totalToBought = uniBought.add(kncBought);
            const expectedFee = getExpectedFees(totalToBought);
            const totalToSpend = totalToBought.add(expectedFee);

            // Orders for UNI and KNC
            let orders: ZeroExOrder[] = getUniAndKncWithDaiOrders(uniBought, kncBought);

            // User1 creates the portfolio/NFT and emit event NftUpdated
            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .addTokens(1, context.mockDAI.address, totalToSpend, orders),
            )
                .to.emit(context.nestedFactory, "NftUpdated")
                .withArgs(1);

            // 6 UNI and 4 KNC must be in the reserve
            expect(await context.mockUNI.balanceOf(context.nestedReserve.address)).to.be.equal(
                uniBought.add(baseUniBought),
            );
            expect(await context.mockKNC.balanceOf(context.nestedReserve.address)).to.be.equal(
                kncBought.add(baseKncBought),
            );

            /*
             * User1 must have the right DAI amount :
             * baseAmount - amount spent for addTokens - amount spent for create
             */
            expect(await context.mockDAI.balanceOf(context.user1.address)).to.be.equal(
                context.baseAmount.sub(totalToSpend).sub(baseTotalToSpend),
            );

            // The FeeSplitter must receive the right fee amount (+ fee of create)
            expect(await context.mockDAI.balanceOf(context.feeSplitter.address)).to.be.equal(
                expectedFee.add(baseExpectedFee),
            );

            // Must store UNI and KNC in the records of the NFT
            expect(await context.nestedRecords.getAssetTokens(1).then(value => value.toString())).to.be.equal(
                [context.mockUNI.address, context.mockKNC.address].toString(),
            );

            // Must have the right amount in the holdings
            const holdingsUNI = await context.nestedRecords.getAssetHolding(1, context.mockUNI.address);
            expect(holdingsUNI.token).to.be.equal(context.mockUNI.address);
            expect(holdingsUNI.amount).to.be.equal(uniBought.add(baseUniBought));
            const holdingsKNC = await context.nestedRecords.getAssetHolding(1, context.mockKNC.address);
            expect(holdingsKNC.token).to.be.equal(context.mockKNC.address);
            expect(holdingsKNC.amount).to.be.equal(kncBought.add(baseKncBought));
        });

        it("increase KNI and UNI amount from DAI (ZeroExOperator) with more than needed", async () => {
            /*
             * All the amounts for this test :
             * - Buy 6 UNI and 4 KNC
             * - The user needs 10 DAI (+ fees) but will spend 20 DAI (10 DAI in excess)
             */
            const uniBought = appendDecimals(6);
            const kncBought = appendDecimals(4);
            const totalToBought = uniBought.add(kncBought);
            const totalToSpend = appendDecimals(20);

            // Orders for UNI and KNC
            let orders: ZeroExOrder[] = getUniAndKncWithDaiOrders(uniBought, kncBought);

            await context.nestedFactory
                .connect(context.user1)
                .addTokens(1, context.mockDAI.address, totalToSpend, orders);

            // The FeeSplitter must receive the DAI in excess
            expect(await context.mockDAI.balanceOf(context.feeSplitter.address)).to.be.equal(
                totalToSpend.add(baseTotalToSpend).sub(totalToBought).sub(baseTotalToBought),
            );
        });

        it("add new token (DAI) from ETH", async () => {
            // All the amounts for this test
            const daiBought = appendDecimals(10);
            const expectedFee = getExpectedFees(daiBought);
            const totalToSpend = daiBought.add(expectedFee);

            let orders: ZeroExOrder[] = [
                {
                    operator: toBytes32("ZeroEx"),
                    token: context.mockDAI.address,
                    callData: abiCoder.encode(
                        ["address", "address", "bytes4", "bytes"],
                        [
                            context.WETH.address,
                            context.mockDAI.address,
                            dummyRouterSelector,
                            abiCoder.encode(
                                ["address", "address", "uint"],
                                [context.WETH.address, context.mockDAI.address, daiBought],
                            ),
                        ],
                    ),
                    commit: true,
                },
            ];

            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .addTokens(1, ETH, totalToSpend, orders, { value: totalToSpend }),
            )
                .to.emit(context.nestedFactory, "NftUpdated")
                .withArgs(1);

            // Must store DAI in the records of the NFT
            expect(await context.nestedRecords.getAssetTokens(1).then(value => value.toString())).to.be.equal(
                [context.mockUNI.address, context.mockKNC.address, context.mockDAI.address].toString(),
            );

            // Must have the right amount in the holdings
            const holdingsUNI = await context.nestedRecords.getAssetHolding(1, context.mockUNI.address);
            expect(holdingsUNI.token).to.be.equal(context.mockUNI.address);
            expect(holdingsUNI.amount).to.be.equal(baseUniBought);
            const holdingsKNC = await context.nestedRecords.getAssetHolding(1, context.mockKNC.address);
            expect(holdingsKNC.token).to.be.equal(context.mockKNC.address);
            expect(holdingsKNC.amount).to.be.equal(baseKncBought);
            const holdingsDAI = await context.nestedRecords.getAssetHolding(1, context.mockDAI.address);
            expect(holdingsDAI.token).to.be.equal(context.mockDAI.address);
            expect(holdingsDAI.amount).to.be.equal(daiBought);
        });
    });

    describe("swapTokenForTokens()", () => {
        // Amount already in the portfolio
        let baseUniBought = appendDecimals(6);
        let baseKncBought = appendDecimals(4);
        let baseTotalToBought = baseUniBought.add(baseKncBought);
        let baseExpectedFee = getExpectedFees(baseTotalToBought);
        let baseTotalToSpend = baseTotalToBought.add(baseExpectedFee);

        beforeEach("Set reserve and create NFT (id 1)", async () => {
            // set reserve
            await context.nestedFactory.connect(context.masterDeployer).setReserve(context.nestedReserve.address);

            // create nft 1 with UNI and KNC from DAI (use the base amounts)
            let orders: ZeroExOrder[] = getUniAndKncWithDaiOrders(baseUniBought, baseKncBought);
            await context.nestedFactory
                .connect(context.user1)
                .create(0, context.mockDAI.address, baseTotalToSpend, orders);
        });

        it("reverts if Orders list is empty", async () => {
            it("reverts if Orders list is empty", async () => {
                let orders: ZeroExOrder[] = [];
                await expect(
                    context.nestedFactory
                        .connect(context.user1)
                        .swapTokenForTokens(1, context.mockUNI.address, 0, orders),
                ).to.be.revertedWith("NestedFactory::addTokens: Missing orders");
            });
        });

        it("reverts if bad calldatas", async () => {
            it("reverts if bad calldatas", async () => {
                // All the amounts for this test
                const uniBought = appendDecimals(10);
                const expectedFee = getExpectedFees(uniBought);
                const totalToSpend = uniBought.add(expectedFee);

                // Orders to swap UNI from the portfolio but the sellToken param (ZeroExOperator) is removed
                const orders: ZeroExOrder[] = [
                    {
                        operator: toBytes32("ZeroEx"),
                        token: context.mockDAI.address,
                        callData: abiCoder.encode(
                            ["address", "bytes4", "bytes"],
                            [
                                context.mockDAI.address,
                                dummyRouterSelector,
                                abiCoder.encode(
                                    ["address", "address", "uint"],
                                    [context.mockUNI.address, context.mockDAI.address, uniBought],
                                ),
                            ],
                        ),
                        commit: true,
                    },
                ];

                await expect(
                    context.nestedFactory
                        .connect(context.user1)
                        .swapTokenForTokens(1, context.mockUNI.address, totalToSpend, orders),
                ).to.be.revertedWith("NestedFactory::_submitOrder: Operator call failed");
            });
        });

        it("cant swap token from nonexistent portfolio", async () => {
            // Amounts and Orders must be good
            const kncBought = appendDecimals(10);
            const totalToBought = kncBought;
            const expectedFee = totalToBought.div(100);
            const totalToSpend = totalToBought.add(expectedFee);
            let orders: ZeroExOrder[] = getTokenBWithTokenAOrders(
                kncBought,
                context.mockKNC.address,
                context.mockUSDC.address,
            );

            // NFT with id = 2 shouldn't exist
            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .swapTokenForTokens(2, context.mockDAI.address, totalToSpend, orders),
            ).to.be.revertedWith("ERC721: owner query for nonexistent token");
        });

        it("cant swap token from another user portfolio", async () => {
            // Amounts and Orders must be good
            const kncBought = appendDecimals(10);
            const totalToBought = kncBought;
            const expectedFee = getExpectedFees(totalToBought);
            const totalToSpend = totalToBought.add(expectedFee);
            let orders: ZeroExOrder[] = getTokenBWithTokenAOrders(
                kncBought,
                context.mockKNC.address,
                context.mockUSDC.address,
            );

            // Master Deployer is not the owner of NFT 1
            await expect(
                context.nestedFactory
                    .connect(context.masterDeployer)
                    .swapTokenForTokens(1, context.mockDAI.address, totalToSpend, orders),
            ).to.be.revertedWith("NestedFactory: Not the token owner");
        });

        it("reverts if the UNI amount in portfolio is less than total sum of UNI sales", async () => {
            /*
             * All the amounts for this test :
             * - Buy 5 USDC
             * - The user needs 5 UNI (+ fees) but only 3 UNI will be used
             */
            const usdcBought = appendDecimals(5);
            const totalToSpend = appendDecimals(3);

            // Orders for UNI and KNC
            let orders: ZeroExOrder[] = getTokenBWithTokenAOrders(
                usdcBought,
                context.mockUNI.address,
                context.mockUSDC.address,
            );

            // Should revert with "assert" (no message)
            await expect(
                context.nestedFactory.connect(context.user1).create(0, context.mockUNI.address, totalToSpend, orders),
            ).to.be.reverted;
        });

        it("reverts if not enought UNI in the portfolio to get USDC", async () => {
            /*
             * All the amounts for this test :
             * - Buy 10 USDC
             * - The user needs 10 UNI (+ fees) but only 6 UNI in the portfolio
             */
            const usdcBought = appendDecimals(10);
            const totalToSpend = appendDecimals(10);

            // Orders for UNI and KNC
            let orders: ZeroExOrder[] = getTokenBWithTokenAOrders(
                usdcBought,
                context.mockUNI.address,
                context.mockUSDC.address,
            );

            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .swapTokenForTokens(1, context.mockUNI.address, totalToSpend, orders),
            ).to.be.revertedWith("NestedFactory:_transferInputTokens: Insufficient amount");
        });

        it("increase UNI amount from KNC in portfolio (ZeroExOperator) with right amounts", async () => {
            // All the amounts for this test
            const uniBought = appendDecimals(3);
            const totalToBought = uniBought;
            const expectedFee = getExpectedFees(totalToBought);
            const totalToSpend = totalToBought.add(expectedFee);

            // Orders for UNI and KNC
            let orders: ZeroExOrder[] = getTokenBWithTokenAOrders(
                uniBought,
                context.mockKNC.address,
                context.mockUNI.address,
            );

            // User1 creates the portfolio/NFT and emit event NftUpdated
            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .swapTokenForTokens(1, context.mockKNC.address, totalToSpend, orders),
            )
                .to.emit(context.nestedFactory, "NftUpdated")
                .withArgs(1);

            // 10 UNI must be in the reserve
            expect(await context.mockUNI.balanceOf(context.nestedReserve.address)).to.be.equal(
                uniBought.add(baseUniBought),
            );
            expect(await context.mockKNC.balanceOf(context.nestedReserve.address)).to.be.equal(
                baseKncBought.sub(totalToSpend),
            );

            // The FeeSplitter must receive the right fee amount (in KNC)
            expect(await context.mockKNC.balanceOf(context.feeSplitter.address)).to.be.equal(expectedFee);

            // Must store UNI and KNC in the records of the NFT
            expect(await context.nestedRecords.getAssetTokens(1).then(value => value.toString())).to.be.equal(
                [context.mockUNI.address, context.mockKNC.address].toString(),
            );

            // Must have the right amount in the holdings
            const holdingsUNI = await context.nestedRecords.getAssetHolding(1, context.mockUNI.address);
            expect(holdingsUNI.token).to.be.equal(context.mockUNI.address);
            expect(holdingsUNI.amount).to.be.equal(uniBought.add(baseUniBought));
        });

        it("increase UNI amount from KNC in portfolio (ZeroExOperator) with more than needed", async () => {
            /*
             * All the amounts for this test :
             * - Buy 3 UNI with 3 KNC from the portfolio
             * - The user needs 3 KNC (+ fees) but will spend 4 KNC
             */
            const uniBought = appendDecimals(3);
            const totalToSpend = appendDecimals(4);

            // Orders for UNI and KNC
            let orders: ZeroExOrder[] = getTokenBWithTokenAOrders(
                uniBought,
                context.mockKNC.address,
                context.mockUNI.address,
            );

            // User1 creates the portfolio/NFT and emit event NftUpdated
            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .swapTokenForTokens(1, context.mockKNC.address, totalToSpend, orders),
            )
                .to.emit(context.nestedFactory, "NftUpdated")
                .withArgs(1);

            // The FeeSplitter must receive the KNC in excess
            expect(await context.mockKNC.balanceOf(context.feeSplitter.address)).to.be.equal(
                totalToSpend.sub(uniBought),
            );
        });

        it("swap UNI in portfolio for USDC (ZeroExOperator) with right amounts", async () => {
            // All the amounts for this test
            const usdcBought = appendDecimals(3);
            const expectedFee = getExpectedFees(usdcBought);
            const totalToSpend = usdcBought.add(expectedFee);

            // Orders to buy USDC with UNI
            let orders: ZeroExOrder[] = getTokenBWithTokenAOrders(
                usdcBought,
                context.mockUNI.address,
                context.mockUSDC.address,
            );

            // User1 creates the portfolio/NFT and emit event NftUpdated
            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .swapTokenForTokens(1, context.mockUNI.address, totalToSpend, orders),
            )
                .to.emit(context.nestedFactory, "NftUpdated")
                .withArgs(1);

            // The FeeSplitter must receive the UNI in excess
            expect(await context.mockUNI.balanceOf(context.feeSplitter.address)).to.be.equal(expectedFee);

            // Must store UNI, KNC and USDC in the records of the NFT
            expect(await context.nestedRecords.getAssetTokens(1).then(value => value.toString())).to.be.equal(
                [context.mockUNI.address, context.mockKNC.address, context.mockUSDC.address].toString(),
            );

            // Must have the right amount in the holdings
            const holdingsUNI = await context.nestedRecords.getAssetHolding(1, context.mockUNI.address);
            expect(holdingsUNI.token).to.be.equal(context.mockUNI.address);
            expect(holdingsUNI.amount).to.be.equal(baseUniBought.sub(totalToSpend));
            const holdingsKNC = await context.nestedRecords.getAssetHolding(1, context.mockKNC.address);
            expect(holdingsKNC.token).to.be.equal(context.mockKNC.address);
            expect(holdingsKNC.amount).to.be.equal(baseKncBought);
            const holdingsUSDC = await context.nestedRecords.getAssetHolding(1, context.mockUSDC.address);
            expect(holdingsUSDC.token).to.be.equal(context.mockUSDC.address);
            expect(holdingsUSDC.amount).to.be.equal(usdcBought);
        });
    });

    describe("sellTokensToNft()", () => {
        // Amount already in the portfolio
        let baseUniBought = appendDecimals(6);
        let baseKncBought = appendDecimals(4);
        let baseTotalToBought = baseUniBought.add(baseKncBought);
        let baseExpectedFee = getExpectedFees(baseTotalToBought);
        let baseTotalToSpend = baseTotalToBought.add(baseExpectedFee);

        beforeEach("Set reserve and create NFT (id 1)", async () => {
            // set reserve
            await context.nestedFactory.connect(context.masterDeployer).setReserve(context.nestedReserve.address);

            // create nft 1 with UNI and KNC from DAI (use the base amounts)
            let orders: ZeroExOrder[] = getUniAndKncWithDaiOrders(baseUniBought, baseKncBought);
            await context.nestedFactory
                .connect(context.user1)
                .create(0, context.mockDAI.address, baseTotalToSpend, orders);
        });

        it("reverts if Orders list is empty", async () => {
            let orders: ZeroExOrder[] = [];
            await expect(
                context.nestedFactory.connect(context.user1).sellTokensToNft(1, context.mockDAI.address, [], orders),
            ).to.be.revertedWith("NestedFactory::sellTokensToNft: Missing orders");
        });

        it("reverts if bad calldatas", async () => {
            // 6 UNI in the portfolio, the user sell 3 UNI for 3 UDC
            const uniSold = appendDecimals(3);

            // Orders to swap UNI from the portfolio but the sellToken param (ZeroExOperator) is removed
            const orders: ZeroExOrder[] = [
                {
                    operator: toBytes32("ZeroEx"),
                    token: context.mockUNI.address,
                    callData: abiCoder.encode(
                        ["address", "bytes4", "bytes"],
                        [
                            context.mockUSDC.address,
                            dummyRouterSelector,
                            abiCoder.encode(
                                ["address", "address", "uint"],
                                [context.mockUNI.address, context.mockUSDC.address, uniSold],
                            ),
                        ],
                    ),
                    commit: true,
                },
            ];

            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .sellTokensToNft(1, context.mockUSDC.address, [uniSold], orders),
            ).to.be.revertedWith("NestedFactory::_submitOrder: Operator call failed");
        });

        it("cant swap tokens from nonexistent portfolio", async () => {
            // 6 UNI and 4 KNC in the portfolio, the user sell 3 UNI and 3 KNC for 6 USCC
            const uniSold = appendDecimals(3);
            const kncSold = appendDecimals(3);

            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold);

            // NFT with id = 2 shouldn't exist
            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .sellTokensToNft(2, context.mockUSDC.address, [uniSold, kncSold], orders),
            ).to.be.revertedWith("ERC721: owner query for nonexistent token");
        });

        it("cant swap tokens from another user portfolio", async () => {
            // 6 UNI and 4 KNC in the portfolio, the user sell 3 UNI and 3 KNC for 6 USCC
            const uniSold = appendDecimals(3);
            const kncSold = appendDecimals(3);

            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold);

            // Master Deployer is not the owner of NFT 1
            await expect(
                context.nestedFactory
                    .connect(context.masterDeployer)
                    .sellTokensToNft(1, context.mockUSDC.address, [uniSold, kncSold], orders),
            ).to.be.revertedWith("NestedFactory: Not the token owner");
        });

        it("cant swap tokens if orders dont match sell amounts (array size)", async () => {
            // 6 UNI and 4 KNC in the portfolio, the user sell 3 UNI and 3 KNC for 6 USCC
            const uniSold = appendDecimals(3);
            const kncSold = appendDecimals(3);

            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold);

            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .sellTokensToNft(1, context.mockUSDC.address, [uniSold], orders),
            ).to.be.revertedWith("NestedFactory::sellTokensToNft: Input lengths must match");
        });

        it("revert if spend more UNI than in reserve", async () => {
            // 6 UNI and 4 KNC in the portfolio, the user sell 7 UNI and 3 KNC for 6 USCC
            const uniSold = appendDecimals(7);
            const kncSold = appendDecimals(3);

            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold);

            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .sellTokensToNft(1, context.mockUSDC.address, [uniSold, kncSold], orders),
            ).to.be.revertedWith("NestedFactory:_transferInputTokens: Insufficient amount");
        });

        it("revert if try to sell more KNC than sell amount", async () => {
            // 6 UNI and 4 KNC in the portfolio, the user sell 3 UNI and 3 KNC for 6 USCC
            const uniSold = appendDecimals(3);
            const kncSold = appendDecimals(3);

            // The amount in the order is more than sell amount
            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold.add(appendDecimals(1)));

            // Error in operator cant transfer more than in factory balance
            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .sellTokensToNft(1, context.mockUSDC.address, [uniSold, kncSold], orders),
            ).to.be.revertedWith("NestedFactory::_submitOrder: Operator call failed");
        });

        it("reverts if wrong output token in calldata", async () => {
            // 6 UNI and 4 KNC in the portfolio, the user sell 3 UNI and 3 KNC for 6 USCC
            const uniSold = appendDecimals(3);
            const kncSold = appendDecimals(3);

            // The amount in the order is more than sell amount
            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold);

            // Instead of USDC as output token, use DAI
            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .sellTokensToNft(1, context.mockDAI.address, [uniSold, kncSold], orders),
            ).to.be.revertedWith("NestedFactory::_submitOrder: Wrong output token in calldata");
        });

        it("swap KNC and UNI for USDC (ZeroExOperator) with right amounts", async () => {
            // 6 UNI and 4 KNC in the portfolio, the user sell 3 UNI and 4 KNC for 7 USCC
            const uniSold = appendDecimals(3);
            const kncSold = appendDecimals(4);
            const usdcBought = kncSold.add(uniSold);
            const expectedUsdcFees = getExpectedFees(usdcBought);

            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold);

            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .sellTokensToNft(1, context.mockUSDC.address, [uniSold, kncSold], orders),
            )
                .to.emit(context.nestedFactory, "NftUpdated")
                .withArgs(1);

            // 3 UNI must be in the reserve
            expect(await context.mockUNI.balanceOf(context.nestedReserve.address)).to.be.equal(
                baseUniBought.sub(uniSold),
            );
            // 0 KNC must be in the reserve
            expect(await context.mockKNC.balanceOf(context.nestedReserve.address)).to.be.equal(
                baseKncBought.sub(kncSold),
            );
            // 7 USDC - fees must be in the reserve
            expect(await context.mockUSDC.balanceOf(context.nestedReserve.address)).to.be.equal(
                usdcBought.sub(expectedUsdcFees),
            );

            // The FeeSplitter must receive the right fee amount (in USDC)
            expect(await context.mockUSDC.balanceOf(context.feeSplitter.address)).to.be.equal(expectedUsdcFees);

            // Must store UNI, and USDC in the records of the NFT
            expect(await context.nestedRecords.getAssetTokens(1).then(value => value.toString())).to.be.equal(
                [context.mockUNI.address, context.mockUSDC.address].toString(),
            );

            // Must have the right amount in the holdings
            const holdingsUNI = await context.nestedRecords.getAssetHolding(1, context.mockUNI.address);
            expect(holdingsUNI.token).to.be.equal(context.mockUNI.address);
            expect(holdingsUNI.amount).to.be.equal(baseUniBought.sub(uniSold));

            // Must have the right amount in the holdings
            const holdingsUSDC = await context.nestedRecords.getAssetHolding(1, context.mockUSDC.address);
            expect(holdingsUSDC.token).to.be.equal(context.mockUSDC.address);
            expect(holdingsUSDC.amount).to.be.equal(usdcBought.sub(expectedUsdcFees));
        });

        it("swap KNC and UNI for USDC (ZeroExOperator) with more than needed", async () => {
            // 6 UNI and 4 KNC in the portfolio, the user sell 3 UNI and 4 KNC for 7 USCC
            const uniSold = appendDecimals(3);
            const kncSold = appendDecimals(4);
            const usdcBought = kncSold.add(uniSold);

            // The amount in the order is less than sell amount. Only 5 USDC will be bought
            const uniSoldOrder = uniSold.sub(appendDecimals(1));
            const kncSoldOrder = kncSold.sub(appendDecimals(1));
            const usdcBoughtOrder = uniSoldOrder.add(kncSoldOrder);
            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSoldOrder, kncSoldOrder);
            const orderExpectedFee = getExpectedFees(uniSoldOrder.add(kncSoldOrder));

            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .sellTokensToNft(1, context.mockUSDC.address, [uniSold, kncSold], orders),
            )
                .to.emit(context.nestedFactory, "NftUpdated")
                .withArgs(1);

            // 3 UNI must be in the reserve
            expect(await context.mockUNI.balanceOf(context.nestedReserve.address)).to.be.equal(
                baseUniBought.sub(uniSold),
            );
            // 0 KNC must be in the reserve
            expect(await context.mockKNC.balanceOf(context.nestedReserve.address)).to.be.equal(
                baseKncBought.sub(kncSold),
            );
            // 5 USDC - fees must be in the reserve
            expect(await context.mockUSDC.balanceOf(context.nestedReserve.address)).to.be.equal(
                usdcBoughtOrder.sub(orderExpectedFee),
            );

            // The FeeSplitter must receive the right fee amount (in USDC)
            expect(await context.mockUSDC.balanceOf(context.feeSplitter.address)).to.be.equal(orderExpectedFee);

            // The FeeSplitter must receive fees on excess UNI
            expect(await context.mockUNI.balanceOf(context.feeSplitter.address)).to.be.equal(
                getExpectedFees(uniSold.sub(uniSoldOrder)),
            );

            // The FeeSplitter must receive fees on excess KNC
            expect(await context.mockKNC.balanceOf(context.feeSplitter.address)).to.be.equal(
                getExpectedFees(kncSold.sub(kncSoldOrder)),
            );

            // The user received the excess UNI
            expect(await context.mockUNI.balanceOf(context.user1.address)).to.be.equal(
                context.baseAmount.add(uniSold.sub(uniSoldOrder).sub(getExpectedFees(uniSold.sub(uniSoldOrder)))),
            );

            // The user received the excess KNC
            expect(await context.mockKNC.balanceOf(context.user1.address)).to.be.equal(
                context.baseAmount.add(kncSold.sub(kncSoldOrder).sub(getExpectedFees(kncSold.sub(kncSoldOrder)))),
            );

            // Must store UNI, and USDC in the records of the NFT
            expect(await context.nestedRecords.getAssetTokens(1).then(value => value.toString())).to.be.equal(
                [context.mockUNI.address, context.mockUSDC.address].toString(),
            );

            // Must have the right amount in the holdings
            const holdingsUNI = await context.nestedRecords.getAssetHolding(1, context.mockUNI.address);
            expect(holdingsUNI.token).to.be.equal(context.mockUNI.address);
            expect(holdingsUNI.amount).to.be.equal(baseUniBought.sub(uniSold));

            const holdingsUSDC = await context.nestedRecords.getAssetHolding(1, context.mockUSDC.address);
            expect(holdingsUSDC.token).to.be.equal(context.mockUSDC.address);
            expect(holdingsUSDC.amount).to.be.equal(usdcBoughtOrder.sub(orderExpectedFee));
        });
    });

    // Tests are very similar to sellTokensToNft(), but some expectations can be different
    describe("sellTokensToWallet()", () => {
        // Amount already in the portfolio
        let baseUniBought = appendDecimals(6);
        let baseKncBought = appendDecimals(4);
        let baseTotalToBought = baseUniBought.add(baseKncBought);
        let baseExpectedFee = getExpectedFees(baseTotalToBought);
        let baseTotalToSpend = baseTotalToBought.add(baseExpectedFee);

        beforeEach("Set reserve and create NFT (id 1)", async () => {
            // set reserve
            await context.nestedFactory.connect(context.masterDeployer).setReserve(context.nestedReserve.address);

            // create nft 1 with UNI and KNC from DAI (use the base amounts)
            let orders: ZeroExOrder[] = getUniAndKncWithDaiOrders(baseUniBought, baseKncBought);
            await context.nestedFactory
                .connect(context.user1)
                .create(0, context.mockDAI.address, baseTotalToSpend, orders);
        });

        it("reverts if Orders list is empty", async () => {
            let orders: ZeroExOrder[] = [];
            await expect(
                context.nestedFactory.connect(context.user1).sellTokensToWallet(1, context.mockDAI.address, [], orders),
            ).to.be.revertedWith("NestedFactory::sellTokensToWallet: Missing orders");
        });

        it("reverts if bad calldatas", async () => {
            // 6 UNI in the portfolio, the user sell 3 UNI for 3 UDC
            const uniSold = appendDecimals(3);

            // Orders to swap UNI from the portfolio but the sellToken param (ZeroExOperator) is removed
            const orders: ZeroExOrder[] = [
                {
                    operator: toBytes32("ZeroEx"),
                    token: context.mockUNI.address,
                    callData: abiCoder.encode(
                        ["address", "bytes4", "bytes"],
                        [
                            context.mockUSDC.address,
                            dummyRouterSelector,
                            abiCoder.encode(
                                ["address", "address", "uint"],
                                [context.mockUNI.address, context.mockUSDC.address, uniSold],
                            ),
                        ],
                    ),
                    commit: true,
                },
            ];

            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .sellTokensToWallet(1, context.mockUSDC.address, [uniSold], orders),
            ).to.be.revertedWith("NestedFactory::_submitOrder: Operator call failed");
        });

        it("cant swap tokens from nonexistent portfolio", async () => {
            // 6 UNI and 4 KNC in the portfolio, the user sell 3 UNI and 3 KNC for 6 USCC
            const uniSold = appendDecimals(3);
            const kncSold = appendDecimals(3);

            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold);

            // NFT with id = 2 shouldn't exist
            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .sellTokensToWallet(2, context.mockUSDC.address, [uniSold, kncSold], orders),
            ).to.be.revertedWith("ERC721: owner query for nonexistent token");
        });

        it("cant swap tokens from another user portfolio", async () => {
            // 6 UNI and 4 KNC in the portfolio, the user sell 3 UNI and 3 KNC for 6 USCC
            const uniSold = appendDecimals(3);
            const kncSold = appendDecimals(3);

            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold);

            // Master Deployer is not the owner of NFT 1
            await expect(
                context.nestedFactory
                    .connect(context.masterDeployer)
                    .sellTokensToWallet(1, context.mockUSDC.address, [uniSold, kncSold], orders),
            ).to.be.revertedWith("NestedFactory: Not the token owner");
        });

        it("cant swap tokens if orders dont match sell amounts (array size)", async () => {
            // 6 UNI and 4 KNC in the portfolio, the user sell 3 UNI and 3 KNC for 6 USCC
            const uniSold = appendDecimals(3);
            const kncSold = appendDecimals(3);

            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold);

            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .sellTokensToWallet(1, context.mockUSDC.address, [uniSold], orders),
            ).to.be.revertedWith("NestedFactory::sellTokensToWallet: Input lengths must match");
        });

        it("revert if spend more UNI than in reserve", async () => {
            // 6 UNI and 4 KNC in the portfolio, the user sell 7 UNI and 3 KNC for 6 USCC
            const uniSold = appendDecimals(7);
            const kncSold = appendDecimals(3);

            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold);

            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .sellTokensToWallet(1, context.mockUSDC.address, [uniSold, kncSold], orders),
            ).to.be.revertedWith("NestedFactory:_transferInputTokens: Insufficient amount");
        });

        it("revert if try to sell more KNC than sell amount", async () => {
            // 6 UNI and 4 KNC in the portfolio, the user sell 3 UNI and 3 KNC for 6 USCC
            const uniSold = appendDecimals(3);
            const kncSold = appendDecimals(3);

            // The amount in the order is more than sell amount
            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold.add(appendDecimals(1)));

            // Error in operator cant transfer more than in factory balance
            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .sellTokensToWallet(1, context.mockUSDC.address, [uniSold, kncSold], orders),
            ).to.be.revertedWith("NestedFactory::_submitOrder: Operator call failed");
        });

        it("reverts if wrong output token in calldata", async () => {
            // 6 UNI and 4 KNC in the portfolio, the user sell 3 UNI and 3 KNC for 6 USCC
            const uniSold = appendDecimals(3);
            const kncSold = appendDecimals(3);

            // The amount in the order is more than sell amount
            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold);

            // Instead of USDC as output token, use DAI
            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .sellTokensToWallet(1, context.mockDAI.address, [uniSold, kncSold], orders),
            ).to.be.revertedWith("NestedFactory::_submitOrder: Wrong output token in calldata");
        });

        it("swap KNC and UNI for USDC (ZeroExOperator) with right amounts", async () => {
            // 6 UNI and 4 KNC in the portfolio, the user sell 3 UNI and 4 KNC for 7 USCC
            const uniSold = appendDecimals(3);
            const kncSold = appendDecimals(4);
            const usdcBought = kncSold.add(uniSold);
            const expectedUsdcFees = getExpectedFees(usdcBought);

            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold);

            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .sellTokensToWallet(1, context.mockUSDC.address, [uniSold, kncSold], orders),
            )
                .to.emit(context.nestedFactory, "NftUpdated")
                .withArgs(1);

            // 3 UNI must be in the reserve
            expect(await context.mockUNI.balanceOf(context.nestedReserve.address)).to.be.equal(
                baseUniBought.sub(uniSold),
            );
            // 0 KNC must be in the reserve
            expect(await context.mockKNC.balanceOf(context.nestedReserve.address)).to.be.equal(
                baseKncBought.sub(kncSold),
            );
            // 0 USDC - fees must be in the reserve
            expect(await context.mockUSDC.balanceOf(context.nestedReserve.address)).to.be.equal(BigNumber.from(0));

            // The FeeSplitter must receive the right fee amount (in USDC)
            expect(await context.mockUSDC.balanceOf(context.feeSplitter.address)).to.be.equal(expectedUsdcFees);

            // Only UNI in the records
            expect(await context.nestedRecords.getAssetTokens(1).then(value => value.toString())).to.be.equal(
                [context.mockUNI.address].toString(),
            );

            // Must have the right amount in the holdings
            const holdingsUNI = await context.nestedRecords.getAssetHolding(1, context.mockUNI.address);
            expect(holdingsUNI.token).to.be.equal(context.mockUNI.address);
            expect(holdingsUNI.amount).to.be.equal(baseUniBought.sub(uniSold));

            expect(await context.mockUSDC.balanceOf(context.user1.address)).to.be.equal(
                context.baseAmount.add(usdcBought.sub(expectedUsdcFees)),
            );
        });

        it("swap KNC and UNI for USDC (ZeroExOperator) with more than needed", async () => {
            // 6 UNI and 4 KNC in the portfolio, the user sell 3 UNI and 4 KNC for 7 USCC
            const uniSold = appendDecimals(3);
            const kncSold = appendDecimals(4);
            const usdcBought = kncSold.add(uniSold);

            // The amount in the order is less than sell amount. Only 5 USDC will be bought
            const uniSoldOrder = uniSold.sub(appendDecimals(1));
            const kncSoldOrder = kncSold.sub(appendDecimals(1));
            const usdcBoughtOrder = uniSoldOrder.add(kncSoldOrder);
            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSoldOrder, kncSoldOrder);
            const orderExpectedFee = getExpectedFees(uniSoldOrder.add(kncSoldOrder));

            await expect(
                context.nestedFactory
                    .connect(context.user1)
                    .sellTokensToWallet(1, context.mockUSDC.address, [uniSold, kncSold], orders),
            )
                .to.emit(context.nestedFactory, "NftUpdated")
                .withArgs(1);

            // 3 UNI must be in the reserve
            expect(await context.mockUNI.balanceOf(context.nestedReserve.address)).to.be.equal(
                baseUniBought.sub(uniSold),
            );
            // 0 KNC must be in the reserve
            expect(await context.mockKNC.balanceOf(context.nestedReserve.address)).to.be.equal(
                baseKncBought.sub(kncSold),
            );
            // 0 USDC must be in the reserve
            expect(await context.mockUSDC.balanceOf(context.nestedReserve.address)).to.be.equal(BigNumber.from(0));

            // The FeeSplitter must receive the right fee amount (in USDC)
            expect(await context.mockUSDC.balanceOf(context.feeSplitter.address)).to.be.equal(orderExpectedFee);

            // The FeeSplitter must receive fees on excess UNI
            expect(await context.mockUNI.balanceOf(context.feeSplitter.address)).to.be.equal(
                getExpectedFees(uniSold.sub(uniSoldOrder)),
            );

            // The FeeSplitter must receive fees on excess KNC
            expect(await context.mockKNC.balanceOf(context.feeSplitter.address)).to.be.equal(
                getExpectedFees(kncSold.sub(kncSoldOrder)),
            );

            // The user received the excess UNI
            expect(await context.mockUNI.balanceOf(context.user1.address)).to.be.equal(
                context.baseAmount.add(uniSold.sub(uniSoldOrder).sub(getExpectedFees(uniSold.sub(uniSoldOrder)))),
            );

            // The user received the excess KNC
            expect(await context.mockKNC.balanceOf(context.user1.address)).to.be.equal(
                context.baseAmount.add(kncSold.sub(kncSoldOrder).sub(getExpectedFees(kncSold.sub(kncSoldOrder)))),
            );

            // The user received the USDC
            expect(await context.mockUSDC.balanceOf(context.user1.address)).to.be.equal(
                context.baseAmount.add(usdcBoughtOrder.sub(getExpectedFees(usdcBoughtOrder))),
            );

            // Must store UNI, and USDC in the records of the NFT
            expect(await context.nestedRecords.getAssetTokens(1).then(value => value.toString())).to.be.equal(
                [context.mockUNI.address].toString(),
            );

            // Must have the right amount in the holdings
            const holdingsUNI = await context.nestedRecords.getAssetHolding(1, context.mockUNI.address);
            expect(holdingsUNI.token).to.be.equal(context.mockUNI.address);
            expect(holdingsUNI.amount).to.be.equal(baseUniBought.sub(uniSold));
        });
    });

    describe("destroy()", () => {
        // Amount already in the portfolio
        let baseUniBought = appendDecimals(6);
        let baseKncBought = appendDecimals(4);
        let baseTotalToBought = baseUniBought.add(baseKncBought);
        let baseExpectedFee = getExpectedFees(baseTotalToBought);
        let baseTotalToSpend = baseTotalToBought.add(baseExpectedFee);

        beforeEach("Set reserve and create NFT (id 1)", async () => {
            // set reserve
            await context.nestedFactory.connect(context.masterDeployer).setReserve(context.nestedReserve.address);

            // create nft 1 with UNI and KNC from DAI (use the base amounts)
            let orders: ZeroExOrder[] = getUniAndKncWithDaiOrders(baseUniBought, baseKncBought);
            await context.nestedFactory
                .connect(context.user1)
                .create(0, context.mockDAI.address, baseTotalToSpend, orders);
        });

        it("reverts if Orders list is empty", async () => {
            let orders: ZeroExOrder[] = [];
            await expect(
                context.nestedFactory.connect(context.user1).destroy(1, context.mockDAI.address, orders),
            ).to.be.revertedWith("NestedFactory::destroy: Missing orders");
        });

        it("reverts if bad calldatas", async () => {
            const uniSold = appendDecimals(6);
            const kncSold = appendDecimals(4);

            // The sellToken param (ZeroExOperator) is removed
            const orders: ZeroExOrder[] = [
                {
                    operator: toBytes32("ZeroEx"),
                    token: context.mockUNI.address,
                    callData: abiCoder.encode(
                        ["address", "bytes4", "bytes"],
                        [
                            context.mockUSDC.address,
                            dummyRouterSelector,
                            abiCoder.encode(
                                ["address", "address", "uint"],
                                [context.mockUNI.address, context.mockUSDC.address, uniSold],
                            ),
                        ],
                    ),
                    commit: true,
                },
                {
                    operator: toBytes32("ZeroEx"),
                    token: context.mockKNC.address,
                    callData: abiCoder.encode(
                        ["address", "bytes4", "bytes"],
                        [
                            context.mockUSDC.address,
                            dummyRouterSelector,
                            abiCoder.encode(
                                ["address", "address", "uint"],
                                [context.mockKNC.address, context.mockUSDC.address, kncSold],
                            ),
                        ],
                    ),
                    commit: true,
                },
            ];

            await expect(
                context.nestedFactory.connect(context.user1).destroy(1, context.mockUSDC.address, orders),
            ).to.be.revertedWith("NestedFactory::_submitOrder: Operator call failed");
        });

        it("cant swap tokens from nonexistent portfolio", async () => {
            // 6 UNI and 4 KNC in the portfolio, sell everything for 10 USCC
            const uniSold = appendDecimals(6);
            const kncSold = appendDecimals(4);

            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold);

            // NFT with id = 2 shouldn't exist
            await expect(
                context.nestedFactory.connect(context.user1).destroy(2, context.mockUSDC.address, orders),
            ).to.be.revertedWith("ERC721: owner query for nonexistent token");
        });

        it("cant swap tokens from another user portfolio", async () => {
            // 6 UNI and 4 KNC in the portfolio, sell everything for 10 USCC
            const uniSold = appendDecimals(6);
            const kncSold = appendDecimals(4);

            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold);

            // Master Deployer is not the owner of NFT 1
            await expect(
                context.nestedFactory.connect(context.masterDeployer).destroy(1, context.mockUSDC.address, orders),
            ).to.be.revertedWith("NestedFactory: Not the token owner");
        });

        it("revert if holdings and orders don't match", async () => {
            // 6 UNI and 4 KNC in the portfolio, try to sell only the UNI (KNC missing)
            const uniSold = appendDecimals(6);

            let orders: ZeroExOrder[] = [
                {
                    operator: toBytes32("ZeroEx"),
                    token: context.mockUNI.address,
                    callData: abiCoder.encode(
                        ["address", "address", "bytes4", "bytes"],
                        [
                            context.mockUNI.address,
                            context.mockUSDC.address,
                            dummyRouterSelector,
                            abiCoder.encode(
                                ["address", "address", "uint"],
                                [context.mockUNI.address, context.mockUSDC.address, uniSold],
                            ),
                        ],
                    ),
                    commit: true,
                },
            ];

            await expect(
                context.nestedFactory.connect(context.user1).destroy(1, context.mockUSDC.address, orders),
            ).to.be.revertedWith("NestedFactory::destroy: Missing sell args");
        });

        it("revert if spend more UNI than in reserve", async () => {
            // 6 UNI and 4 KNC in the portfolio, sell 7 UNI
            const uniSold = appendDecimals(7);
            const kncSold = appendDecimals(4);

            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold);

            await expect(
                context.nestedFactory.connect(context.user1).destroy(1, context.mockUSDC.address, orders),
            ).to.be.revertedWith("NestedFactory::_submitOrder: Operator call failed");
        });

        it("reverts if wrong input token in calldata (different from holding)", async () => {
            // 6 UNI and 4 KNC in the portfolio, sell 7 UNI
            const uniSold = appendDecimals(6);
            const kncSold = appendDecimals(4);

            // Change KNC for DAI
            let orders: ZeroExOrder[] = [
                {
                    operator: toBytes32("ZeroEx"),
                    token: context.mockUNI.address,
                    callData: abiCoder.encode(
                        ["address", "address", "bytes4", "bytes"],
                        [
                            context.mockUNI.address,
                            context.mockUSDC.address,
                            dummyRouterSelector,
                            abiCoder.encode(
                                ["address", "address", "uint"],
                                [context.mockUNI.address, context.mockUSDC.address, uniSold],
                            ),
                        ],
                    ),
                    commit: true,
                },
                {
                    operator: toBytes32("ZeroEx"),
                    token: context.mockDAI.address,
                    callData: abiCoder.encode(
                        ["address", "address", "bytes4", "bytes"],
                        [
                            context.mockDAI.address,
                            context.mockUSDC.address,
                            dummyRouterSelector,
                            abiCoder.encode(
                                ["address", "address", "uint"],
                                [context.mockDAI.address, context.mockUSDC.address, kncSold],
                            ),
                        ],
                    ),
                    commit: true,
                },
            ];

            await expect(
                context.nestedFactory.connect(context.user1).destroy(1, context.mockUSDC.address, orders),
            ).to.be.revertedWith("NestedFactory::_submitOrder: Operator call failed");
        });

        it("delete nft for USDC with right amounts", async () => {
            // 6 UNI and 4 KNC in the portfolio, sell everything for 10 USDC
            const uniSold = appendDecimals(6);
            const kncSold = appendDecimals(4);
            const usdcBought = uniSold.add(kncSold);

            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSold, kncSold);

            await expect(context.nestedFactory.connect(context.user1).destroy(1, context.mockUSDC.address, orders))
                .to.emit(context.nestedFactory, "NftBurned")
                .withArgs(1);

            expect(await context.mockUSDC.balanceOf(context.feeSplitter.address)).to.be.equal(
                getExpectedFees(usdcBought),
            );

            // No holdings for NFT 1
            expect(await context.nestedRecords.getAssetTokens(1).then(value => value.toString())).to.be.equal(
                [].toString(),
            );

            // The NFT is burned
            await expect(context.nestedAsset.ownerOf(1)).to.be.revertedWith(
                "ERC721: owner query for nonexistent token",
            );
        });

        it("delete nft for ETH with right amounts", async () => {
            // 6 UNI and 4 KNC in the portfolio, sell everything for 10 WETH
            const uniSold = appendDecimals(6);
            const kncSold = appendDecimals(4);
            const wethBought = uniSold.add(kncSold);

            let orders: ZeroExOrder[] = getWethWithUniAndKncOrders(uniSold, kncSold);

            await expect(context.nestedFactory.connect(context.user1).destroy(1, context.WETH.address, orders))
                .to.emit(context.nestedFactory, "NftBurned")
                .withArgs(1);

            expect(await context.WETH.balanceOf(context.feeSplitter.address)).to.be.equal(getExpectedFees(wethBought));

            // No holdings for NFT 1
            expect(await context.nestedRecords.getAssetTokens(1).then(value => value.toString())).to.be.equal(
                [].toString(),
            );

            // The NFT is burned
            await expect(context.nestedAsset.ownerOf(1)).to.be.revertedWith(
                "ERC721: owner query for nonexistent token",
            );
        });

        it("delete nft for USDC with UNI leftovers", async () => {
            // 6 UNI and 4 KNC in the portfolio, sell everything for 10 USDC
            const uniSold = appendDecimals(6); // But 2 UNI leftovers
            const kncSold = appendDecimals(4);
            const uniSoldOrder = appendDecimals(4);
            const usdcBought = uniSoldOrder.add(kncSold);

            let orders: ZeroExOrder[] = getUsdcWithUniAndKncOrders(uniSoldOrder, kncSold);

            await expect(context.nestedFactory.connect(context.user1).destroy(1, context.mockUSDC.address, orders))
                .to.emit(context.nestedFactory, "NftBurned")
                .withArgs(1);

            expect(await context.mockUSDC.balanceOf(context.feeSplitter.address)).to.be.equal(
                getExpectedFees(usdcBought),
            );

            // No holdings for NFT 1
            expect(await context.nestedRecords.getAssetTokens(1).then(value => value.toString())).to.be.equal(
                [].toString(),
            );

            // The NFT is burned
            await expect(context.nestedAsset.ownerOf(1)).to.be.revertedWith(
                "ERC721: owner query for nonexistent token",
            );

            // User receive the leftovers UNI - fees
            expect(await context.mockUNI.balanceOf(context.user1.address)).to.be.equal(
                context.baseAmount.add(uniSold.sub(uniSoldOrder)).sub(getExpectedFees(uniSold.sub(uniSoldOrder))),
            );
        });
    });

    describe("withdraw()", () => {
        // Amount already in the portfolio
        let baseUniBought = appendDecimals(6);
        let baseKncBought = appendDecimals(4);
        let baseTotalToBought = baseUniBought.add(baseKncBought);
        let baseExpectedFee = getExpectedFees(baseTotalToBought);
        let baseTotalToSpend = baseTotalToBought.add(baseExpectedFee);

        beforeEach("Set reserve and create NFT (id 1)", async () => {
            // set reserve
            await context.nestedFactory.connect(context.masterDeployer).setReserve(context.nestedReserve.address);

            // create nft 1 with UNI and KNC from DAI (use the base amounts)
            let orders: ZeroExOrder[] = getUniAndKncWithDaiOrders(baseUniBought, baseKncBought);
            await context.nestedFactory
                .connect(context.user1)
                .create(0, context.mockDAI.address, baseTotalToSpend, orders);
        });

        it("cant withdraw from another user portfolio", async () => {
            await expect(
                context.nestedFactory.connect(context.masterDeployer).withdraw(1, 1, context.mockKNC.address),
            ).to.be.revertedWith("NestedFactory: Not the token owner");
        });

        it("cant withdraw from nonexistent portfolio", async () => {
            await expect(
                context.nestedFactory.connect(context.user1).withdraw(2, 1, context.mockKNC.address),
            ).to.be.revertedWith("ERC721: owner query for nonexistent token");
        });

        it("cant withdraw if wrong token index", async () => {
            // KNC => Index 1
            await expect(
                context.nestedFactory.connect(context.user1).withdraw(1, 2, context.mockKNC.address),
            ).to.be.revertedWith("NestedFactory::withdraw: Invalid token index");
        });

        it("remove token from holdings", async () => {
            await expect(context.nestedFactory.connect(context.user1).withdraw(1, 1, context.mockKNC.address))
                .to.emit(context.nestedFactory, "NftUpdated")
                .withArgs(1);

            // Must remove KNC from holdings
            expect(await context.nestedRecords.getAssetTokens(1).then(value => value.toString())).to.be.equal(
                [context.mockUNI.address].toString(),
            );

            // User and fee splitter receive funds
            expect(await context.mockKNC.balanceOf(context.feeSplitter.address)).to.be.equal(
                getExpectedFees(baseKncBought),
            );
            expect(await context.mockKNC.balanceOf(context.user1.address)).to.be.equal(
                context.baseAmount.add(baseKncBought.sub(getExpectedFees(baseKncBought))),
            );
        });

        it("cant withdraw the last token", async () => {
            // Withdraw KNC first
            await context.nestedFactory.connect(context.user1).withdraw(1, 1, context.mockKNC.address);

            // Should not me able to withdraw UNI (the last token)
            await expect(
                context.nestedFactory.connect(context.user1).withdraw(1, 0, context.mockUNI.address),
            ).to.be.revertedWith("NestedFactory::withdraw: Can't withdraw the last asset");
        });
    });

    describe("increaseLockTimestamp()", () => {
        // Amount already in the portfolio
        let baseUniBought = appendDecimals(6);
        let baseKncBought = appendDecimals(4);
        let baseTotalToBought = baseUniBought.add(baseKncBought);
        let baseExpectedFee = getExpectedFees(baseTotalToBought);
        let baseTotalToSpend = baseTotalToBought.add(baseExpectedFee);

        beforeEach("Set reserve and create NFT (id 1)", async () => {
            // set reserve
            await context.nestedFactory.connect(context.masterDeployer).setReserve(context.nestedReserve.address);

            // create nft 1 with UNI and KNC from DAI (use the base amounts)
            let orders: ZeroExOrder[] = getUniAndKncWithDaiOrders(baseUniBought, baseKncBought);
            await context.nestedFactory
                .connect(context.user1)
                .create(0, context.mockDAI.address, baseTotalToSpend, orders);
        });

        it("cant increase if another user portfolio", async () => {
            await expect(
                context.nestedFactory.connect(context.masterDeployer).increaseLockTimestamp(1, Date.now()),
            ).to.be.revertedWith("NestedFactory: Not the token owner");
        });

        it("cant increase nonexistent portfolio", async () => {
            await expect(
                context.nestedFactory.connect(context.user1).increaseLockTimestamp(2, Date.now()),
            ).to.be.revertedWith("ERC721: owner query for nonexistent token");
        });

        it("cant decrease timestamp", async () => {
            await context.nestedFactory.connect(context.user1).increaseLockTimestamp(1, Date.now());
            await expect(
                context.nestedFactory.connect(context.user1).increaseLockTimestamp(1, Date.now() - 1000),
            ).to.be.revertedWith("NestedRecords::increaseLockTimestamp: Can't decrease timestamp");
        });

        /*
         * We are testing with the "withdraw" function, but it's the same for
         * all the functions implementing the "isUnlocked" modifier.
         */
        it("cant withdraw if locked", async () => {
            await expect(context.nestedFactory.connect(context.user1).increaseLockTimestamp(1, Date.now() + 1000))
                .to.emit(context.nestedRecords, "LockTimestampIncreased")
                .withArgs(1, Date.now() + 1000);

            await expect(
                context.nestedFactory.connect(context.user1).withdraw(1, 0, context.mockUNI.address),
            ).to.be.revertedWith("NestedFactory: The NFT is currently locked");
        });

        it("can withdraw after the waiting period", async () => {
            await expect(context.nestedFactory.connect(context.user1).increaseLockTimestamp(1, Date.now() + 1000))
                .to.emit(context.nestedRecords, "LockTimestampIncreased")
                .withArgs(1, Date.now() + 1000);

            await network.provider.send("evm_increaseTime", [Date.now()]);
            await network.provider.send("evm_mine");

            await expect(context.nestedFactory.connect(context.user1).withdraw(1, 0, context.mockUNI.address)).to.not.be
                .reverted;
        });
    });

    // Create the Orders to buy KNC and UNI with DAI
    function getUniAndKncWithDaiOrders(uniBought: BigNumber, kncBought: BigNumber) {
        return [
            {
                operator: toBytes32("ZeroEx"),
                token: context.mockUNI.address,
                callData: abiCoder.encode(
                    ["address", "address", "bytes4", "bytes"],
                    [
                        context.mockDAI.address,
                        context.mockUNI.address,
                        dummyRouterSelector,
                        abiCoder.encode(
                            ["address", "address", "uint"],
                            [context.mockDAI.address, context.mockUNI.address, uniBought],
                        ),
                    ],
                ),
                commit: true,
            },
            {
                operator: toBytes32("ZeroEx"),
                token: context.mockKNC.address,
                callData: abiCoder.encode(
                    ["address", "address", "bytes4", "bytes"],
                    [
                        context.mockDAI.address,
                        context.mockKNC.address,
                        dummyRouterSelector,
                        abiCoder.encode(
                            ["address", "address", "uint"],
                            [context.mockDAI.address, context.mockKNC.address, kncBought],
                        ),
                    ],
                ),
                commit: true,
            },
        ];
    }

    // Create the Orders to buy KNC and UNI with ETH
    function getUniAndKncWithETHOrders(uniBought: BigNumber, kncBought: BigNumber) {
        return [
            {
                operator: toBytes32("ZeroEx"),
                token: context.mockUNI.address,
                callData: abiCoder.encode(
                    ["address", "address", "bytes4", "bytes"],
                    [
                        context.WETH.address,
                        context.mockUNI.address,
                        dummyRouterSelector,
                        abiCoder.encode(
                            ["address", "address", "uint"],
                            [context.WETH.address, context.mockUNI.address, uniBought],
                        ),
                    ],
                ),
                commit: true,
            },
            {
                operator: toBytes32("ZeroEx"),
                token: context.mockKNC.address,
                callData: abiCoder.encode(
                    ["address", "address", "bytes4", "bytes"],
                    [
                        context.WETH.address,
                        context.mockKNC.address,
                        dummyRouterSelector,
                        abiCoder.encode(
                            ["address", "address", "uint"],
                            [context.WETH.address, context.mockKNC.address, kncBought],
                        ),
                    ],
                ),
                commit: true,
            },
        ];
    }

    // Generic function to create a 1:1 Order
    function getTokenBWithTokenAOrders(amount: BigNumber, tokenA: string, tokenB: string) {
        return [
            {
                operator: toBytes32("ZeroEx"),
                token: tokenB,
                callData: abiCoder.encode(
                    ["address", "address", "bytes4", "bytes"],
                    [
                        tokenA,
                        tokenB,
                        dummyRouterSelector,
                        abiCoder.encode(["address", "address", "uint"], [tokenA, tokenB, amount]),
                    ],
                ),
                commit: true,
            },
        ];
    }

    // Create the Orders to get USDC with UNI and KNC
    function getUsdcWithUniAndKncOrders(uniSold: BigNumber, kncSold: BigNumber) {
        return [
            {
                operator: toBytes32("ZeroEx"),
                token: context.mockUNI.address,
                callData: abiCoder.encode(
                    ["address", "address", "bytes4", "bytes"],
                    [
                        context.mockUNI.address,
                        context.mockUSDC.address,
                        dummyRouterSelector,
                        abiCoder.encode(
                            ["address", "address", "uint"],
                            [context.mockUNI.address, context.mockUSDC.address, uniSold],
                        ),
                    ],
                ),
                commit: true,
            },
            {
                operator: toBytes32("ZeroEx"),
                token: context.mockKNC.address,
                callData: abiCoder.encode(
                    ["address", "address", "bytes4", "bytes"],
                    [
                        context.mockKNC.address,
                        context.mockUSDC.address,
                        dummyRouterSelector,
                        abiCoder.encode(
                            ["address", "address", "uint"],
                            [context.mockKNC.address, context.mockUSDC.address, kncSold],
                        ),
                    ],
                ),
                commit: true,
            },
        ];
    }

    // Create the Orders to get Eth with UNI and KNC
    function getWethWithUniAndKncOrders(uniSold: BigNumber, kncSold: BigNumber) {
        return [
            {
                operator: toBytes32("ZeroEx"),
                token: context.mockUNI.address,
                callData: abiCoder.encode(
                    ["address", "address", "bytes4", "bytes"],
                    [
                        context.mockUNI.address,
                        context.WETH.address,
                        dummyRouterSelector,
                        abiCoder.encode(
                            ["address", "address", "uint"],
                            [context.mockUNI.address, context.WETH.address, uniSold],
                        ),
                    ],
                ),
                commit: true,
            },
            {
                operator: toBytes32("ZeroEx"),
                token: context.mockKNC.address,
                callData: abiCoder.encode(
                    ["address", "address", "bytes4", "bytes"],
                    [
                        context.mockKNC.address,
                        context.WETH.address,
                        dummyRouterSelector,
                        abiCoder.encode(
                            ["address", "address", "uint"],
                            [context.mockKNC.address, context.WETH.address, kncSold],
                        ),
                    ],
                ),
                commit: true,
            },
        ];
    }

    function getExpectedFees(amount: BigNumber) {
        return amount.div(100);
    }
});
