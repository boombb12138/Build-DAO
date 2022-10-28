import { Contract, providers } from "ethers";
import { formatEther } from "ethers/lib/utils";
import web3Modal from "web3modal";

import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import styles from "../styles/Home.module.css";

import {
  CRYPTODEVS_DAO_ABI,
  CRYPTODEVS_DAO_CONTRACT_ADDRESS,
  CRYPTODEVS_NFT_ABI,
  CRYPTODEVS_NFT_CONTRACT_ADDRESS,
} from "../constants";

export default function Home() {
  // DAO合约的eth余额
  const [treasuryBalance, setTreasuryBalance] = useState("0");
  // 提案的数量
  const [numProposals, setNumProposals] = useState("0");
  // 包含所有提案的数组
  const [proposals, setProposals] = useState([]);
  // 用户的CryptoDevs NFTs余额
  const [nftBalance, setNftBalance] = useState(0);
  // 要购买的假NFT的Token ID，创建提案的时候被使用
  const [fakeNftTokenId, setFakeNftTokenId] = useState("");
  // 创建提案或者看提案
  const [selectedTab, setSelectedTab] = useState("");
  // 等待交易或交易失败的时候 Loading=true
  const [loading, setLoading] = useState(false);
  // 用户已经连接钱包就是true
  const [walletConnected, setWalletConnected] = useState(false);
  const web3ModalRef = useRef();

  // 连接钱包的辅助函数
  const connectWallet = async () => {
    try {
      await getProviderOrSigner();
      setWalletConnected(true);
    } catch (error) {
      console.error(error);
    }
  };
  // 读取DAO合约的eth余额 设置treasuryBalance
  const getDAOTreasuryBalance = async () => {
    try {
      const provider = await getProviderOrSigner();
      const balance = await provider.getBalance(
        CRYPTODEVS_DAO_CONTRACT_ADDRESS
      );
      setTreasuryBalance(balance.toString());
    } catch (error) {
      console.error(error);
    }
  };
  // 读取在DAO合约中的提案数量，设置numProposals
  const getNumProposalsInDAO = async () => {
    try {
      const provider = await getProviderOrSigner();
      const contract = getDaoContractInstance(provider);
      const daoNumProposals = await contract.numProposals();
      setNumProposals(daoNumProposals.toString());
    } catch (error) {
      console.error(error);
    }
  };
  // 读取用户的CryptoDevs NFT余额，设置nftBalance
  const getUserNFTBalance = async () => {
    try {
      const signer = await getProviderOrSigner(true);
      const nftContract = getCryptodevsNFTContractInstance(signer);
      const balance = await nftContract.balanceOf(signer.getAddress());
      setNftBalance(parseInt(balance.toString()));
    } catch (error) {
      console.error(error);
    }
  };
  // 调用合约中的createProposal方法，使用到了fakeNftTokenId
  const createProposal = async () => {
    try {
      const signer = await getProviderOrSigner(true);
      const daoContract = getDaoContractInstance(signer);
      const txn = await daoContract.createProposal(fakeNftTokenId);
      setLoading(true);
      await txn.wait();
      await getNumProposalsInDAO();
      setLoading(false);
    } catch (error) {
      console.error(error);
      window.alert(error.data.message);
    }
  };
  // 辅助函数，用来获取并解析DAO合约中的提案
  // 传入一个提案的Id 将提案转换成我们可以使用的对象并返回
  const fetchProposalById = async (id) => {
    try {
      const provider = await getProviderOrSigner();
      const daoContract = getDaoContractInstance(provider);
      const proposal = await daoContract.proposals(id);

      const parsedProposal = {
        proposalId: id,
        nftTokenId: proposal.nftTokenId.toString(),
        // todo 这里为什么要包裹一个new Date
        deadline: new Date(parseInt(proposal.deadline.toString()) * 1000),
        yayVotes: proposal.yayVotes.toString(),
        nayVotes: proposal.nayVotes.toString(),
        executed: proposal.executed,
      };
      return parsedProposal;
    } catch (error) {
      console.error(error);
    }
  };
  // 通过循环 获得所有的提案
  const fetchAllProposals = async () => {
    try {
      const proposals = [];
      for (let i = 0; i < numProposals; i++) {
        const proposal = await fetchProposalById(i);
        proposals.push(proposal);
      }
      setProposals(proposals);
      return proposals;
    } catch (error) {
      console.error(error);
    }
  };
  // 调用合约的voteOnProposal方法，传入proposal ID 和 Vote
  const voteOnProposal = async (proposalId, _vote) => {
    try {
      const signer = await getProviderOrSigner(true);
      const daoContract = getDaoContractInstance(signer);

      let vote = _vote === "YAY" ? 0 : 1;
      const txn = await daoContract.voteOnProposal(proposalId, vote);
      setLoading(true);
      await txn.wait();
      setLoading(false);
      await fetchAllProposals();
    } catch (error) {
      console.error(error);
      window.alert(error.data.message);
    }
  };

  // 调用合约的executeProposal方法，传入proposal ID
  const executeProposal = async (proposalId) => {
    try {
      const signer = await getProviderOrSigner(true);
      const daoContract = getDaoContractInstance(signer);
      const txn = await daoContract.executeProposal(proposalId);
      setLoading(true);
      await txn.wait();
      setLoading(false);
      await fetchAllProposals();
    } catch (error) {
      console.error(error);
      window.alert(error);
    }
  };
  // 从Metamask获取Provider或者signer
  const getProviderOrSigner = async (needSigner = false) => {
    const provider = await web3ModalRef.current.connect();
    const web3Provider = new providers.Web3Provider(provider);

    const { chainId } = await web3Provider.getNetwork();
    if (chainId !== 5) {
      window.alert("Please switch to the Goerli network!");
      throw new Error("Please switch to the Goerli network!");
    }
    if (needSigner) {
      const signer = web3Provider.getSigner();
      return signer;
    }
    return web3Provider;
  };
  // 创建DAO合约实例
  const getDaoContractInstance = (providerOrSigner) => {
    return new Contract(
      CRYPTODEVS_DAO_CONTRACT_ADDRESS,
      CRYPTODEVS_DAO_ABI,
      providerOrSigner
    );
  };
  // 创建NFT合约实例
  const getCryptodevsNFTContractInstance = (providerOrSigner) => {
    return new Contract(
      CRYPTODEVS_NFT_CONTRACT_ADDRESS,
      CRYPTODEVS_NFT_ABI,
      providerOrSigner
    );
  };
  //每次' walletConnected '的值改变时运行的代码
  //如果没有连接，提示用户连接钱包
  //然后调用该函数获取DAO库余额、用户NFT余额和DAO中的提案数量
  useEffect(() => {
    if (!walletConnected) {
      web3ModalRef.current = new web3Modal({
        network: "goerli",
        providerOptions: {},
        disableInjectedProvider: false,
      });

      connectWallet().then(() => {
        getDAOTreasuryBalance();
        getUserNFTBalance();
        getNumProposalsInDAO();
      });
    }
  }, [walletConnected]);
  // 每次' selectedTab '的值改变时运行的一段代码
  //当用户切换到'View Proposals'选项卡时，重新获取DAO中的所有提议
  useEffect(() => {
    if (selectedTab === "View Proposal") {
      fetchAllProposals();
    }
  }, [selectedTab]);

  // 根据“selectedTab”渲染对应选项卡的内容
  function renderTabs() {
    if (selectedTab === "Create Proposal") {
      return renderCreateProposalTab();
    } else if (selectedTab === "View Proposal") {
      return renderViewProposalsTab();
    }
    return null;
  }

  // 渲染Create Proposal选项卡的内容
  function renderCreateProposalTab() {
    if (loading) {
      return (
        <div className={styles.description}>
          Loading..Waiting for transaction..
        </div>
      );
    } else if (nftBalance === 0) {
      return (
        <div className={styles.description}>
          You do not own any CryptoDevs NFTs. <br />
          <b>You cannot create or vote on proposals</b>
        </div>
      );
    } else {
      return (
        <div className={styles.container}>
          <label>Fake NFT Token ID to Purchase: </label>
          <input
            placeholder="0"
            type="number"
            onChange={(e) => setFakeNftTokenId(e.target.value)}
          ></input>
          <button className={styles.button2} onClick={createProposal}>
            Create
          </button>
        </div>
      );
    }
  }
  // 渲染View Proposals选项卡的内容
  function renderViewProposalsTab() {
    if (loading) {
      return (
        <div className={styles.description}>
          Loading...Waiting for transaction...
        </div>
      );
    } else if (proposals.length === 0) {
      return (
        <div className={styles.description}>No proposals have been created</div>
      );
    } else {
      return (
        <div>
          {proposals.map((p, index) => (
            <div key={index} className={styles.proposalCard}>
              <p>Proposal ID: {p.proposalId}</p>
              <p>Fake NFT to Purchase: {p.nftTokenId}</p>
              <p>Deadline: {p.deadline.toLocaleString()}</p>
              <p>Yay Votes: {p.yayVotes}</p>
              <p>Nay Votes: {p.nayVotes}</p>
              <p>Executed?: {p.executed.toString()}</p>
              {/*  
              不满足三元运算符第1个参数的3种情况：
              1. 已经过了投票时间但是没有执行提案（如果是这种情况就会来到第2个参数）
              2.已经执行过提案还没有过投票时间
              3.既过了投票时间又执行过提案
              3种可能的结构：
              1.还没有过投票时间，而且没有执行提案 就让用户投票
              2.过了投票时间，而且没有执行提案 就让用户执行提案
              3.过了投票时间，也执行过提案 显示已经执行过提案*/}
              {p.deadline.getTime() > Date.now() && !p.executed ? (
                <div className={styles.flex}>
                  <button
                    className={styles.button2}
                    onClick={() => voteOnProposal(p.proposalId, "YAY")}
                  >
                    Vote YAY
                  </button>
                  <button
                    className={styles.button2}
                    onClick={() => voteOnProposal(p.proposalId, "NAY")}
                  >
                    Vote NAY
                  </button>
                </div>
              ) : p.deadline.getTime() < Date.now() && !p.executed ? (
                <div className={styles.flex}>
                  <button
                    className={styles.button2}
                    onClick={() => executeProposal(p.proposalId)}
                  >
                    {/* 为什么这里要加{""} */}
                    Execute Proposal{""}
                    {p.yayVotes > p.nayVotes ? "(YAY)" : "(NAY)"}
                  </button>
                </div>
              ) : (
                <div className={styles.description}>Proposal Executed</div>
              )}
            </div>
          ))}
        </div>
      );
    }
  }
  return (
    <div>
      <Head>
        <title>CryptoDevs DAO</title>
        <meta name="description" content="CryptoDevs DAO" />
        <link ref="icon" href="/favicon.ico"></link>
      </Head>
      <div className={styles.main}>
        <div>
          <h1 className={styles.title}>Welcome to Crypto Devs!</h1>
          <div className={styles.description}>Welcome to the DAO!</div>
          <div className={styles.description}>
            您的NFT余额: {nftBalance}
            <br />
            金库余额:{formatEther(treasuryBalance)} ETH
            <br />
            提案总数：{numProposals}
          </div>
          <div className={styles.flex}>
            <button
              className={styles.button}
              onClick={() => setSelectedTab("Create Proposal")}
            >
              创建提案
            </button>
            <button
              className={styles.button}
              onClick={() => setSelectedTab("View Proposal")}
            >
              查看提案
            </button>
          </div>
          {renderTabs()}
        </div>
        <div>
          <img className={styles.image} src="/cryptodevs/0.svg"></img>
        </div>
      </div>

      <footer className={styles.footer}>Made with &#10084; by Naomi</footer>
    </div>
  );
}
