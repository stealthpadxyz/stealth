import React, { useState, useEffect, useCallback, useContext, useRef, CSSProperties } from 'react'
import { useMount, useUnmount } from 'react-use'
import { Link } from 'react-router-dom'
import { useWeb3React } from '@web3-react/core'
import { BigNumber, Contract, providers, utils } from 'ethers'
import 'react-circular-progressbar/dist/styles.css'
import { UtilContractContext } from '../contracts/Util'
import { StakingManagerV1ContractContext } from '../contracts/StakingManagerV1'
import { TokenData, StakingData, StakingDataForAccount } from '../../typings'
import { motion } from 'framer-motion'
import { Primary as PrimaryButton } from '../Button'
import { NotificationCatcherContext } from '../NotificationCatcher'
import contracts from '../../contracts/production_contracts.json'
import { getShortAddress, getExplorerContractLink, getExplorerTokenLink, getNativeCoin } from '../../util'
import { ERC20ABI } from '../../contracts/external_contracts'
import DetailsCard, { Detail, Title } from '../DetailsCard'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faCircleNotch } from '@fortawesome/free-solid-svg-icons'
import TokenInput from '../TokenInput'
import { Web3Provider as Web3ProviderClass } from '@ethersproject/providers'
import { SplitStakingV1ContractContext } from '../contracts/SplitStakingV1'

const { Web3Provider } = providers

export interface StakingProps {
  stakingData: StakingData
  startExpanded?: boolean
  className?: string
  style?: CSSProperties
  onClaimed?: () => void
}

const Staking: React.FC<StakingProps> = ({
  stakingData,
  startExpanded = false,
  className = '',
  style = {},
  onClaimed,
}) => {
  const { account, chainId, connector } = useWeb3React()
  const [provider, setProvider] = useState<Web3ProviderClass>()
  const { push: pushNotification } = useContext(NotificationCatcherContext)
  const { getTokenData } = useContext(UtilContractContext)
  const { contract, owner } = useContext(StakingManagerV1ContractContext)
  const { setSoloStakingAddress, setLpStakingAddress } = useContext(SplitStakingV1ContractContext)
  const [_stakingData, setStakingData] = useState<StakingData | undefined>(stakingData)
  const [stakingTokenData, setStakingTokenData] = useState<TokenData>()
  const [stakingContract, setStakingContract] = useState<Contract>()
  const [tokenContract, setTokenContract] = useState<Contract>()
  const [stakingAbi, setStakingAbi] = useState<any>()
  // const [depositTokens, setDepositTokens] = useState<string>('')
  const [detailsExpanded, setDetailsExpanded] = useState<boolean>(startExpanded)
  const [settingStakingToken, setSettingStakingToken] = useState<boolean>(false)
  const depositInputRef = useRef<HTMLInputElement>(null)
  const withdrawInputRef = useRef<HTMLInputElement>(null)
  const [depositInputValue, setDepositInputValue] = useState<string>()
  const [withdrawInputValue, setWithdrawInputValue] = useState<string>()
  const [depositApproved, setDepositApproved] = useState<boolean>(false)
  const [depositLoading, setDepositLoading] = useState<boolean>(false)
  const [withdrawLoading, setWithdrawLoading] = useState<boolean>(false)
  const [stakingDataForAccount, setStakingDataForAccount] = useState<StakingDataForAccount>()
  const [paused, setPaused] = useState<boolean>(false)
  // const [withdrawApproved, setWithdrawApproved] = useState<boolean>(false)

  useMount(() => setStakingData(_stakingData))
  useUnmount(() => setStakingData(undefined))

  const getChainId = useCallback(() => {
    return chainId || 0
  }, [chainId])

  useEffect(() => {
    if (!contract || !connector || !getTokenData || !_stakingData) {
      setTokenContract(undefined)
      setStakingTokenData(undefined)
      return
    }

    connector
      .getProvider()
      .then(provider =>
        setTokenContract(new Contract(_stakingData.stakedToken, ERC20ABI, new Web3Provider(provider).getSigner())),
      )
      .catch((err: Error) => {
        console.error(err)
        setTokenContract(undefined)
      })

    getTokenData(_stakingData.stakedToken)
      .then(result => setStakingTokenData(result))
      .catch(console.error)
  }, [contract, connector, _stakingData, getTokenData])

  useEffect(() => {
    if (!account || !tokenContract || !_stakingData || !stakingTokenData) {
      setDepositApproved(false)
      return
    }

    //
    tokenContract
      .allowance(account, _stakingData.contractAddress)
      .then((allowance: BigNumber) => {
        setDepositApproved(allowance.gte(stakingTokenData.balance))
      })
      .catch((err: Error) => {
        console.error(err)
        setDepositApproved(false)
      })
  }, [account, tokenContract, _stakingData, stakingTokenData])

  useEffect(() => {
    switch (chainId) {
      // bsc testnet
      case 56:
        // setStakingAbi(contracts['56'].bsc.contracts.TokenLockerV1.abi)
        break
      case 97:
        setStakingAbi(contracts['97'].bsctest.contracts.StakingV1.abi)
        break
      // localhost
      // case 31337:
      //   setStakingAbi(contracts['31337'].localhost.contracts[_tokenOrLp === 'token' ? 'TokenLockerV1' : 'LPLockerV1'].abi)
      //   break

      default:
        setStakingAbi(undefined)
    }
  }, [chainId])

  useEffect(() => {
    if (!contract || !_stakingData || !stakingAbi || !connector) {
      setStakingContract(undefined)
      return
    }

    connector
      .getProvider()
      .then(provider =>
        setStakingContract(
          new Contract(_stakingData.contractAddress, stakingAbi, new Web3Provider(provider).getSigner()),
        ),
      )
      .catch(err => {
        console.error(err)
        setStakingContract(undefined)
      })
  }, [contract, _stakingData, connector, stakingAbi])

  const updateStakingDataForAccount = useCallback(() => {
    if (!account || !stakingContract) {
      setStakingDataForAccount(undefined)
      return
    }

    stakingContract
      .getStakingDataForAccount(account)
      .then((result: StakingDataForAccount) => {
        setStakingDataForAccount(result)
      })
      .catch((err: Error) => {
        console.error(err)
        setStakingDataForAccount(undefined)
      })
  }, [account, stakingContract])

  useEffect(updateStakingDataForAccount, [updateStakingDataForAccount])

  useEffect(() => {
    if (!connector) {
      setProvider(undefined)
      return
    }

    connector
      .getProvider()
      .then(_provider => {
        setProvider(new Web3Provider(_provider))
      })
      .catch((err: Error) => {
        console.error(err)
        setProvider(undefined)
      })
  }, [connector])

  useEffect(() => {
    if (!account || !stakingContract) {
      return
    }

    const _stakingContract = stakingContract
    const _updateStakingDataForAccount = updateStakingDataForAccount

    // event DepositedEth(address indexed account, uint256 amount);
    // event DepositedTokens(address indexed account, uint256 amount);
    // event WithdrewTokens(address indexed account, uint256 amount);
    // event ClaimedRewards(address indexed account, uint256 amount);

    const onDepositedEth = (_account: string, amount: BigNumber) => {
      //
      console.log(`${_account} deposited ${utils.formatEther(amount)} eth`)

      _updateStakingDataForAccount()
    }

    const onDepositedTokens = (_account: string, amount: BigNumber) => {
      //
      console.log(`${_account} deposited ${utils.formatUnits(amount, 18)} ${stakingTokenData?.symbol || 'tokens'}`)

      // _updateStakingDataForAccount()
    }

    const onWithdrewTokens = (_account: string, amount: BigNumber) => {
      //
      console.log(`${_account} withdrew ${utils.formatUnits(amount, 18)} ${stakingTokenData?.symbol || 'tokens'}`)

      // _updateStakingDataForAccount()
    }

    const onClaimedRewards = (_account: string, amount: BigNumber) => {
      //
      console.log(`${_account} claimed ${utils.formatEther(amount)} ${getNativeCoin(chainId || 0)}`)

      _updateStakingDataForAccount()

      onClaimed && onClaimed()
    }

    const claimedRewardsFilter = _stakingContract.filters['ClaimedRewards'](account)

    _stakingContract.on('DepositedEth', onDepositedEth)
    _stakingContract.on('DepositedTokens', onDepositedTokens)
    _stakingContract.on('WithdrewTokens', onWithdrewTokens)
    _stakingContract.on(claimedRewardsFilter, onClaimedRewards)

    return () => {
      _stakingContract.off('DepositedEth', onDepositedEth)
      _stakingContract.off('DepositedTokens', onDepositedTokens)
      _stakingContract.off('WithdrewTokens', onWithdrewTokens)
      _stakingContract.off(claimedRewardsFilter, onClaimedRewards)
    }
  }, [account, stakingContract, chainId, updateStakingDataForAccount, onClaimed, stakingTokenData])

  useEffect(() => {
    console.log('staking data for account', stakingDataForAccount)
  }, [stakingDataForAccount])

  useEffect(() => {
    if (!account || !tokenContract || !stakingTokenData) {
      return
    }

    const _account = account
    const _tokenContract = tokenContract
    const _stakingTokenData = stakingTokenData
    const _updateStakingDataForAccount = updateStakingDataForAccount

    //
    const transferListener = (from: string, to: string, amount: BigNumber) => {
      console.log(
        `${from} transferred ${utils.formatUnits(amount, _stakingTokenData.decimals)} ${
          _stakingTokenData.symbol
        } to ${to}`,
      )

      _updateStakingDataForAccount()
    }

    const transferFromFilter = _tokenContract.filters['Transfer'](_account)
    const transferToFilter = _tokenContract.filters['Transfer'](null, _account)

    _tokenContract.on(transferFromFilter, transferListener)
    _tokenContract.on(transferToFilter, transferListener)

    return () => {
      _tokenContract.off(transferFromFilter, transferListener)
      _tokenContract.off(transferToFilter, transferListener)
    }
  }, [account, tokenContract, stakingTokenData, updateStakingDataForAccount])

  // useEffect(() => {
  //   if (!stakingContract) return

  //   const numDeposits = 300

  //   stakingContract
  //     .fakeDeposits(numDeposits)
  //     .then(() => {
  //       console.log(`ran ${numDeposits} deposits`)
  //     })
  //     .catch(console.error)
  // }, [stakingContract])

  useEffect(() => {
    if (!stakingContract) {
      setPaused(false)
      return
    }

    stakingContract
      .paused()
      .then((result: boolean) => setPaused(result))
      .catch((err: Error) => {
        console.error(err)
        setPaused(false)
      })
  }, [stakingContract])

  return (
    <DetailsCard
      className={className}
      style={style}
      headerContent={
        //
        _stakingData ? (
          <>
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <Title>
                  <Link to={`/staking/${chainId}/${_stakingData.id}`}>{_stakingData.name || '...'}</Link>
                </Title>
              </div>

              {/* {owner && owner === account && (
                <DarkButton className="text-opacity-50 hover:text-opacity-100">
                  <FontAwesomeIcon icon={faEllipsisV} size="sm" fixedWidth />
                </DarkButton>
              )} */}
            </div>
          </>
        ) : (
          // _stakingData is not ready
          <></>
        )
      }
      mainContent={
        //
        _stakingData && stakingTokenData ? (
          <>
            <div className="flex-grow flex flex-col gap-3">
              {/* <span>
                Stake {stakingTokenData?.symbol || '...'} and receive {chainId ? getNativeCoin(chainId).symbol : '...'}
              </span> */}

              <div className="flex justify-between gap-2 w-full">
                <TokenInput
                  placeholder="Tokens to deposit"
                  className="w-2/3 flex-shrink-0"
                  tokenData={stakingTokenData}
                  maxValue={stakingTokenData.balance}
                  disabled={paused}
                  inputRef={depositInputRef}
                  onChange={setDepositInputValue}
                />

                <PrimaryButton
                  className="self-end flex-grow h-11"
                  disabled={!stakingContract || !tokenContract || !depositInputValue || depositLoading}
                  onClick={async () => {
                    if (!stakingContract || !depositInputRef.current || !tokenContract) return

                    setDepositLoading(true)

                    if (!depositApproved) {
                      //
                      try {
                        const tx = await tokenContract.approve(
                          _stakingData.contractAddress,
                          BigNumber.from(
                            '115792089237316195423570985008687907853269984665640564039457584007913129639935',
                          ),
                        )
                        await tx.wait()

                        setDepositApproved(true)
                      } catch (err) {
                        console.error(err)
                      }
                    } else {
                      try {
                        const tx = await stakingContract.deposit(
                          utils.parseUnits(depositInputRef.current.value, stakingTokenData.decimals),
                        )
                        await tx.wait()
                      } catch (err) {
                        console.error(err)
                      }
                    }

                    setDepositLoading(false)
                  }}
                >
                  {depositLoading ? (
                    <FontAwesomeIcon icon={faCircleNotch} spin={true} />
                  ) : (
                    <div className="">{depositApproved ? 'Deposit' : 'Approve'}</div>
                  )}
                </PrimaryButton>
              </div>

              <div className="flex justify-between gap-2 w-full">
                <TokenInput
                  placeholder="Tokens to withdraw"
                  className="w-2/3 flex-shrink-0"
                  tokenData={stakingTokenData}
                  maxValue={stakingDataForAccount?.amount}
                  inputRef={withdrawInputRef}
                  onChange={setWithdrawInputValue}
                />

                <PrimaryButton
                  className="self-end flex-grow h-11"
                  disabled={!stakingDataForAccount || !withdrawInputValue || stakingDataForAccount.amount.eq(0)}
                  onClick={async () => {
                    if (!stakingContract || !withdrawInputRef.current) return

                    setWithdrawLoading(true)

                    try {
                      const tx = await stakingContract.withdraw(
                        utils.parseUnits(withdrawInputRef.current.value, stakingTokenData.decimals),
                      )
                      await tx.wait()
                    } catch (err) {
                      console.error(err)
                    }

                    setWithdrawLoading(false)
                  }}
                >
                  <div className="">Withdraw</div>
                </PrimaryButton>
              </div>

              <PrimaryButton
                disabled={!stakingDataForAccount || stakingDataForAccount.pendingRewards.eq(0)}
                onClick={() => {
                  if (!stakingContract) return

                  stakingContract
                    .claim()
                    .then((tx: any) => tx.wait())
                    .catch((err: Error) => {
                      console.error(err)
                    })
                }}
              >{`Claim ${utils.formatEther(stakingDataForAccount?.pendingRewards || 0)} ${
                getNativeCoin(chainId || 0).symbol
              }`}</PrimaryButton>

              {stakingContract && stakingTokenData && (
                <motion.div
                  className="flex-grow flex flex-col gap-2"
                  initial={{ height: 0, opacity: 0 }}
                  animate={detailsExpanded ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <hr className="my-1 opacity-10" />

                  <Detail
                    label="Staking contract"
                    value={
                      <a
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-500"
                        href={getExplorerContractLink(getChainId(), stakingContract.address)}
                      >
                        <span>{getShortAddress(stakingContract.address)}</span>
                        {/* <FontAwesomeIcon className="ml-1" size="xs" icon={faExternalLinkAlt} /> */}
                      </a>
                    }
                  />
                  <Detail
                    label={`Token (${stakingTokenData.symbol})`}
                    value={
                      <a
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-500"
                        href={getExplorerTokenLink(getChainId(), _stakingData.stakedToken)}
                      >
                        <span>{getShortAddress(_stakingData.stakedToken)}</span>
                        {/* <FontAwesomeIcon className="ml-1" size="xs" icon={faExternalLinkAlt} /> */}
                      </a>
                    }
                  />
                  <Detail
                    label="Total staked"
                    value={`${utils.commify(utils.formatUnits(_stakingData.totalStaked, _stakingData.decimals))} ${
                      stakingTokenData.symbol
                    }`}
                  />
                  <Detail
                    label="Total rewards"
                    value={`${utils.commify(utils.formatUnits(_stakingData.totalRewards, _stakingData.decimals))} ${
                      chainId ? getNativeCoin(chainId).symbol : ''
                    }`}
                  />

                  <hr className="my-1 opacity-10" />

                  <PrimaryButton
                    onClick={() => {
                      stakingContract && stakingContract.setAutoClaimOptOut(true)
                    }}
                  >
                    Disable auto claim
                  </PrimaryButton>

                  {owner && owner === account && (
                    <>
                      <hr className="my-1 opacity-10" />

                      <PrimaryButton
                        onClick={() => {
                          //
                          stakingContract && stakingContract.setAutoClaimEnabled(false)
                        }}
                      >
                        Disable auto claim globally
                      </PrimaryButton>

                      <div className="grid grid-cols-2 gap-2">
                        <PrimaryButton
                          disabled={settingStakingToken}
                          onClick={() => {
                            setSettingStakingToken(true)

                            setSoloStakingAddress &&
                              setSoloStakingAddress(_stakingData.contractAddress)
                                .then(() => {
                                  setSettingStakingToken(false)

                                  pushNotification &&
                                    pushNotification({
                                      message: `Set solo staking address to ${_stakingData.contractAddress}`,
                                      level: 'success',
                                    })
                                })
                                .catch(err => {
                                  setSettingStakingToken(false)

                                  pushNotification &&
                                    pushNotification({
                                      message: err.message,
                                      level: 'error',
                                    })
                                })
                          }}
                        >
                          Set as solo
                        </PrimaryButton>

                        <PrimaryButton
                          disabled={settingStakingToken}
                          onClick={() => {
                            setSettingStakingToken(true)

                            setLpStakingAddress &&
                              setLpStakingAddress(_stakingData.contractAddress)
                                .then(() => {
                                  setSettingStakingToken(false)

                                  pushNotification &&
                                    pushNotification({
                                      message: `Set LP staking address to ${_stakingData.contractAddress}`,
                                      level: 'success',
                                    })
                                })
                                .catch(err => {
                                  setSettingStakingToken(false)

                                  pushNotification &&
                                    pushNotification({
                                      message: err.message,
                                      level: 'error',
                                    })
                                })
                          }}
                        >
                          Set as LP
                        </PrimaryButton>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </div>
          </>
        ) : (
          // _stakingData is not ready
          <></>
        )
      }
      footerContent={
        _stakingData ? (
          <div>
            <motion.div
              className="text-center cursor-pointer select-none"
              onClick={() => setDetailsExpanded(!detailsExpanded)}
              initial={{ rotateX: 0 }}
              animate={{ rotateX: detailsExpanded ? '180deg' : 0 }}
            >
              <FontAwesomeIcon icon={faChevronDown} fixedWidth />
            </motion.div>
          </div>
        ) : (
          // _stakingData is not ready
          undefined
        )
      }
    />
  )
}

export default Staking
