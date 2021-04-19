require("dotenv/config")
require("solidity-coverage");
require("@nomiclabs/hardhat-waffle");
require("hardhat-deploy");
require("hardhat-deploy-ethers");
require("hardhat-gas-reporter");
require("@nomiclabs/hardhat-solhint");

task("accounts", "Prints the list of accounts", async() => {
    const accounts = await ethers.getSigners();

    for (const account of accounts) {
        console.log(account.address);
    }
});

const accounts = {
    mnemonic: process.env.MNEMONIC,
    initialIndex: 0,
    count: 20,
    accountsBalance: "990000000000000000000",
};

/**
 * Go to https://hardhat.org/config/ to learn more
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            forking: {
                enabled: process.env.FORKING === "true",
                url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_MAINNET_API_KEY}`,

            },
            live: false,
            saveDeployments: true,
            tags: ["test", "local"],
            accounts: accounts,
            // This is because MetaMask mistakenly assumes all networks in http://localhost:8545 to have a chain id of 1337
            // but Hardhat uses a different number by default. Please voice your support for MetaMask to fix this:
            // https://github.com/MetaMask/metamask-extension/issues/9827
            chainId: 1337
        },
        ropsten: {
            url: `https://eth-ropsten.alchemyapi.io/v2/${process.env.ALCHEMY_ROPSTEN_API_KEY}`,
            accounts: accounts,
        },
        kovan: {
            url: `https://eth-kovan.alchemyapi.io/v2/${process.env.ALCHEMY_KOVAN_API_KEY}`,
            accounts: accounts,
        },
        mainnet: {
            url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_MAINNET_API_KEY}`,
            accounts: accounts,
        },
    },
    solidity: "0.8.3",
    gasReporter: {
        coinmarketcap: process.env.COINMARKETCAP_API_KEY,
        currency: "USD",
    }
};