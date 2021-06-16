import axios, { AxiosResponse } from "axios"
import { ethers, network } from "hardhat"
import { pickNFT, readAmountETH, readTokenAddress } from "./cli-interaction"

import { NetworkName } from "./demo-types"
import addresses from "./addresses.json"
import qs from "qs"

async function main() {
    const env = network.name as NetworkName
    const [user] = await ethers.getSigners()

    const NestedFactory = await ethers.getContractFactory("NestedFactory")
    const nestedFactory = await NestedFactory.attach(addresses[env].factory)

    const nftId = await pickNFT()

    let orders = []
    for (let i = 0; i < 15; i++) {
        const token = await readTokenAddress(`#${i + 1} Enter ERC20 token address (press Enter to stop)`)
        if (!token) break
        const inputAmount = await readAmountETH()
        const sellAmount = ethers.utils.parseEther(inputAmount.toString())

        const order = {
            sellToken: addresses[env].tokens.WETH,
            buyToken: token,
            sellAmount: sellAmount.toString(),
            slippagePercentage: 0.3,
        }
        orders.push(order)
    }

    const orderRequests = orders.map(order =>
        axios
            .get(`https://${env === "localhost" ? "ropsten" : env}.api.0x.org/swap/v1/quote?${qs.stringify(order)}`)
            .catch(console.error),
    )
    let responses = ((await Promise.all(orderRequests)) as unknown) as AxiosResponse<any>[]
    responses = responses.filter(r => !!r)
    if (responses.length === 0) return

    const totalSellAmount = responses.reduce(
        (carry, resp) => carry.add(ethers.BigNumber.from(resp.data.sellAmount)),
        ethers.BigNumber.from(0),
    )

    const tx = await nestedFactory.addTokens(
        nftId,
        "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        totalSellAmount,
        responses[0].data.to,
        responses.map(r => ({
            token: r.data.buyTokenAddress,
            callData: r.data.data,
        })),
        {
            value: totalSellAmount.add(totalSellAmount.div(100)),
        },
    )

    console.log("Transaction sent ", tx.hash)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
