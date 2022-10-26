// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

//添加FakeNFTMarketplace合约和CryptoDevs NFT合约 接口
// 这样CryptoDevsDAO合约就知道可以从上面2个合约中调用什么函数 需要传入的参数和返回值

// FakeNFTMarketplace合约的接口
interface IFakeNFTMarketplace {
    // 从合约中返回 1个NFT的价格 单位是wei
    function getPrice() external view returns (uint256);

    // 检查给定的tokenID是不是已经被买了
    function available(uint256 _tokenId) external view returns (bool);

    // 从FakeNFTMarketplace购买NFT
    // _tokenId 购买的假的NFTtoken Id
    function purchase(uint256 _tokenId) external payable;
}

// CryptoDevs NFT合约的接口
// 只有2个我们需要的函数
interface ICryptoDevsNFT {
    // 返回用户拥有的NFT数量
    function balanceOf(address owner) external view returns (uint256);

    //给owner返回一个有index的tokenID
    // index:NFT在owner所拥有的NFT数组里的下标
    function tokenOfOwnerByIndex(address owner, uint256 index)
        external
        view
        returns (uint256);
}

// 合约
contract CryptoDevsDAO is Ownable {
    //   创建一个结构体代表提案
    struct Proposal {
        // 提案通过的要购买的nft的tokenid
        uint256 nftTokenId;
        // 此提案被激活的UNIX时间戳。提案可在超过期限后执行。
        uint256 deadline;
        // 这个提案得到的yay票数
        uint256 yayVotes;
        // 这个提案得到的nay票数
        uint256 nayVotes;
        // 已执行-该建议是否已执行。在超过截止日期之前无法执行。
        bool executed;
        // 一个NFT tokenId映射到布尔值 用来指示NFT是否已经被用来投票
        mapping(uint256 => bool) voters;
    }
    // 一个提案Id映射到提案
    mapping(uint256 => Proposal) public proposals;
    // 已经创建的提案数量
    uint256 public numProposals;

    // 因为我们将调用这两个合约中的方法，所以要初始化这两个合约
    IFakeNFTMarketplace nftMarketplace;
    ICryptoDevsNFT cryptoDevsNFT;

    // 在构造函数中初始化nftMarketplace和cryptoDevsNFT合约 并接收来自部署者的ETH存款，以补充DAO ETH资金
    // 因为我们引入了Owner合约，所以合约的部署者就是合约的拥有者
    // payable允许在合约被部署的时候接受ETH
    constructor(address _nftMarketplace, address _cryptoDevsNFT) payable {
        nftMarketplace = IFakeNFTMarketplace(_nftMarketplace);
        cryptoDevsNFT = ICryptoDevsNFT(_cryptoDevsNFT);
    }

    // 我们希望合约中其他函数仅可以被拥有NFT的人调用
    // 所以创建一个修饰器来避免重复代码
    modifier nftHolderOnly() {
        require(cryptoDevsNFT.balanceOf(msg.sender) > 0, "NOT_A_DAO_MEMBER");
        _;
    }

    // 允许CryptoDevsNFT持有者创建提案
    // _nftTokenId：要购买的NFT tokenID
    // 返回提案的下标
    function createProposal(uint256 _nftTokenId)
        external
        nftHolderOnly
        returns (uint256)
    {
        require(nftMarketplace.available(_nftTokenId), "NFT_NOT_FOR_SALE");
        Proposal storage proposal = proposals[numProposals];
        proposal.nftTokenId = _nftTokenId;
        // 提案投票的截至日期 从现在开始5min就结束
        proposal.deadline = block.timestamp + 5 minutes;

        numProposals++;
        return numProposals - 1;
    }

    // 为了限制正在投票的提案不得超过其截止日期
    modifier activeProposalOnly(uint256 proposalIndex) {
        require(
            proposals[proposalIndex].deadline > block.timestamp,
            "DEADLINE_EXCEEDED"
        );
        _;
    }

    // 投票的值只能是YAY或NAY，所以我们创建枚举类型的值 Vote 来表示投票可能的结果
    // YAY=0 NAY=1
    enum Vote {
        YAY,
        NAY
    }

    // voteOnProposal允许CryptoDevsNFT持有者对一个活跃的提案投票
    ///proposalIndex:提案数组中要投票的提案的索引
    ///vote:他们想投的投票类型 YAY或者NAY
    function voteOnProposal(uint256 proposalIndex, Vote vote)
        external
        nftHolderOnly
        activeProposalOnly(proposalIndex)
    {
        Proposal storage proposal = proposals[proposalIndex];

        uint256 voterNFTBalance = cryptoDevsNFT.balanceOf(msg.sender);
        uint256 numVotes = 0;

        // 计算这个投票者有多少NFT还没有被用来为这个提案投票
        for (uint256 i = 0; i < voterNFTBalance; i++) {
            uint256 tokenId = cryptoDevsNFT.tokenOfOwnerByIndex(msg.sender, i);
            if (proposal.voters[tokenId] == false) {
                numVotes++;
                proposal.voters[tokenId] = true;
            }
        }
        require(numVotes > 0, "ALREADY_VOTED");
        if (vote == Vote.YAY) {
            proposal.yayVotes += numVotes;
        } else {
            proposal.nayVotes += numVotes;
        }
    }

    //创建一个修饰符，只允许函数
    // 在提案的截止日期已经过去或者提案尚未被执行调用
    modifier inactiveProposalOnly(uint256 proposalIndex) {
        require(
            proposals[proposalIndex].deadline <= block.timestamp,
            "DEADLINE_NOT_EXCEEDED"
        );
        require(
            proposals[proposalIndex].executed == false,
            "PROPOSAL_ALREADY_EXECUTED"
        );
        _;
    }

    ///  executeProposal允许任何CryptoDevsNFT持有者在超过提案截止日期时仍然可以执行一个提议
    function executeProposal(uint256 proposalIndex)
        external
        nftHolderOnly
        inactiveProposalOnly(proposalIndex)
    {
        Proposal storage proposal = proposals[proposalIndex];

        // 如果提案拥有的YAY比拥有的NAY多就从FakeNFTMarketplace中买NFT
        if (proposal.yayVotes > proposal.nayVotes) {
            uint256 nftPrice = nftMarketplace.getPrice();
            require(address(this).balance >= nftPrice, "NOT_ENOUGH_FUNDS");
        }
        proposal.executed = true; //executed执行
    }

    // onlyOwner是在Ownable合约里的，限制了函数只能由合约所有者调用
    // withdrawEther允许合约拥有者从合约中提取ETH
    function withdrawEther() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    } // 这将把合同的全部ETH余额转移到所有者地址

    // 合约地址不能接受发送给他们的eth，除非通过调用函数
    // 但我们希望用户能够直接从钱包转移ETH
    // 即 合约能够直接从钱包中接受ETH，而不用调用函数
    receive() external payable {}

    fallback() external payable {}
}
