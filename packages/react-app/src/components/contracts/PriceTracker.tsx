import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { UtilContractContext } from './Util'
import { BigNumber, utils } from 'ethers'
import { LPData, NetworkData } from '../../typings'
import { getNetworkDataByChainId } from '../../util'
import { useWeb3React } from '@web3-react/core'
import { useInterval, usePromise } from 'react-use'

export interface IPriceTrackerContext {
  readonly networkData?: NetworkData
  readonly nativeCoinPrice?: number

  /** assumes the pair has already been checked with `isSupportedPair` */
  getPriceForPair: (lpData: LPData, attempts?: number) => Promise<number>
  isSupportedPair: (lpData: LPData) => boolean
  isSupportedToken: (token: string) => boolean
  /** assumes the pair has already been checked with `isSupportedPair` */
  getTokenFromPair: (lpData: LPData) => string | undefined
  getStablePairAddress: (lpData: LPData) => string | undefined
}

export const PriceTrackerContext = createContext<IPriceTrackerContext | undefined>(undefined)

interface PriceCache {
  price: number
  timestamp: number
}

let PRICE_CACHE: Record<string, PriceCache> = {}

const PriceTrackerContextProvider: React.FC = ({ children }) => {
  const mounted = usePromise()
  const { chainId } = useWeb3React()
  const { contract, getLpData, getTokenData } = useContext(UtilContractContext)
  const [networkData, setNetworkData] = useState<NetworkData>()
  const [nativeStablePair, setNativeStablePair] = useState<string>()
  const [nativeCoinPrice, setNativeCoinPrice] = useState<number>()

  const isSupportedToken = useCallback(
    (token: string) => {
      return networkData ? networkData.supportedLiquidityPairTokens.some(({ address }) => address === token) : false
    },
    [networkData],
  )

  const isSupportedPair = useCallback(
    (lpData: LPData) => {
      return networkData
        ? networkData.supportedLiquidityPairTokens.some(
            ({ address }) => address === lpData.token0 || address === lpData.token1,
          )
        : false
    },
    [networkData],
  )

  const getTokenFromPair = useCallback(
    (lpData: LPData) => {
      return networkData?.supportedLiquidityPairTokens.some(({ address }) => address === lpData.token1)
        ? lpData.token0
        : lpData.token1
    },
    [networkData],
  )

  const getStablePairAddress = useCallback(
    (lpData: LPData) => {
      const token = getTokenFromPair(lpData)
      const pairedToken = token === lpData.token0 ? lpData.token1 : lpData.token0

      const { stablePair } =
        networkData?.supportedLiquidityPairTokens.find(({ address }) => address === pairedToken) || {}

      return stablePair
    },
    [getTokenFromPair, networkData],
  )

  const getPriceForPair = useCallback(
    async (lpData: LPData, attempts: number = 5, attemptNum: number = 1): Promise<number> => {
      if (!getTokenData || attemptNum > attempts) {
        return 0
      }

      const token = getTokenFromPair(lpData)
      const tokenBalance = token === lpData.token0 ? lpData.balance0 : lpData.balance1
      const pairedToken = token === lpData.token0 ? lpData.token1 : lpData.token0
      const pairedTokenBalance = token === lpData.token0 ? lpData.balance1 : lpData.balance0

      if (PRICE_CACHE[pairedToken] && Date.now() - PRICE_CACHE[pairedToken].timestamp < 29000) {
        if (!PRICE_CACHE[pairedToken].price) {
          await new Promise(done => setTimeout(done, 1000))

          return await mounted(getPriceForPair(lpData, attempts, attemptNum++))
        }

        return PRICE_CACHE[pairedToken].price
      }

      PRICE_CACHE[pairedToken] = {
        price: 0,
        timestamp: Date.now(),
      }

      const [tokenData, pairedTokenData] = await mounted(Promise.all([getTokenData(token), getTokenData(pairedToken)]))

      if (!tokenData || !pairedTokenData) {
        return 0
      }

      PRICE_CACHE[pairedToken].price = parseFloat(
        utils.formatUnits(
          tokenBalance.mul(BigNumber.from(10).pow(pairedTokenData.decimals)).div(pairedTokenBalance),
          tokenData.decimals,
        ),
      )

      return PRICE_CACHE[pairedToken].price
    },
    [mounted, getTokenData, getTokenFromPair],
  )

  // wipe the price cache on network change
  useEffect(() => {
    if (typeof chainId === 'undefined' || chainId > -1) {
      PRICE_CACHE = {}
    }
  }, [chainId])

  useEffect(() => {
    //
    if (!chainId) {
      setNetworkData(undefined)
      return
    }

    setNetworkData(getNetworkDataByChainId(chainId))

    return () => {
      setNetworkData(undefined)
    }
  }, [chainId])

  useEffect(() => {
    if (!getLpData || !networkData) {
      setNativeStablePair(undefined)
      return
    }

    const { stablePair } =
      networkData.supportedLiquidityPairTokens.find(_pair => _pair.address === networkData.nativeCurrency.address) || {}

    setNativeStablePair(stablePair)
  }, [getLpData, networkData])

  const updateNativeCoinPrice = useCallback(() => {
    if (!nativeStablePair || !getLpData || !getPriceForPair) {
      setNativeCoinPrice(0)
      return
    }

    mounted(getLpData(nativeStablePair))
      .then(result => {
        if (!result) return Promise.reject(new Error('Failed to get stable pair LP data'))

        return mounted(getPriceForPair(result))
      })
      .then(setNativeCoinPrice)
      .catch(err => {
        console.error(err)
        setNativeCoinPrice(0)
      })
  }, [mounted, nativeStablePair, getLpData, getPriceForPair])

  useEffect(updateNativeCoinPrice, [updateNativeCoinPrice])
  useInterval(updateNativeCoinPrice, 30000)

  return (
    <PriceTrackerContext.Provider
      value={
        contract && getLpData
          ? {
              nativeCoinPrice,

              networkData,

              getPriceForPair,

              isSupportedToken,
              isSupportedPair,

              getTokenFromPair,
              getStablePairAddress,
            }
          : undefined
      }
    >
      {children}
    </PriceTrackerContext.Provider>
  )
}

export default PriceTrackerContextProvider
