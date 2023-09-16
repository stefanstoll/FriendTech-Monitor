import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

// You can get a HTTP RPC from Tenderly
const transport = http('YOUR_HTTP_RPC_HERE');

export const publicClient = createPublicClient({
  chain: base,
  transport,
})