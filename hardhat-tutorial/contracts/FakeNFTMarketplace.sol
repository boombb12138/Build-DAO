// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract FakeNFTMarketplace {
    // 通过Fake TokenID得到Owner addresses
    mapping(uint256 => address) public tokens;

    // 每个假NFT的价格=0.1ether
    uint256 nftPrice = 0.1 ether;

    // 接收ETH，并让tokenID的拥有者成为调用者
    // _tokenId 购买的假的NFTtoken Id
    function purchase(uint256 _tokenId) external payable {
        require(msg.value == nftPrice, "This NFT costs 0.1 ether");
        tokens[_tokenId] = msg.sender;
    }

    // 返回一个NFT价格
    function getPrice() external view returns (uint256) {
        return nftPrice;
    }

    // 检查给定的tokenID是不是已经被买了
    // _tokenId就是要检查的那个id
    // address(0) = 0x0000000000000000000000000000000000000000
    // solidity里面的默认地址
    function available(uint256 _tokenId) external view returns (bool) {
        if (tokens[_tokenId] == address(0)) {
            return true;
        }
        return false;
    }
}
