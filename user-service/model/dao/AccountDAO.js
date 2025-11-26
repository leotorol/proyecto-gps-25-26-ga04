const Account = require('../models/Account');

class AccountDao {
  async create(accountData) {
    const account = new Account(accountData);
    return await account.save();
  }

  async findByEmail(email) {
    return await Account.findOne({ email });
  }

  async findById(id) {
    return await Account.findById(id);
  }

  async findByIdWithArtist(id) {
    return await Account.findById(id).populate('artistId');
  }

  async update(id, updateData) {
    updateData.updatedAt = new Date();
    return await Account.findByIdAndUpdate(id, updateData, { new: true });
  }

  async linkToArtist(accountId, artistId) {
    return await Account.findByIdAndUpdate(
      accountId,
      { 
        artistId: artistId,
        updatedAt: new Date()
      },
      { new: true }
    );
  }

  async findByRole(role) {
    return await Account.find({ role });
  }

  async findBandsWithoutArtist() {
    return await Account.find({ 
      role: 'band',
      artistId: { $exists: false }
    });
  }

  async followArtist(userId, artistId) {
    // $addToSet evita duplicados automáticamente
    return await Account.findByIdAndUpdate(userId, { $addToSet: { following: String(artistId) } }, { new: true });
  }

  async unfollowArtist(userId, artistId) {
    return await Account.findByIdAndUpdate(userId, { $pull: { following: String(artistId) } }, { new: true });
  }

  async likeTrack(userId, trackId) {
    return await Account.findByIdAndUpdate(userId, { $addToSet: { likedTracks: String(trackId) } }, { new: true });
  }

  async unlikeTrack(userId, trackId) {
    return await Account.findByIdAndUpdate(userId, { $pull: { likedTracks: String(trackId) } }, { new: true });
  }

  async delete(id) {
    return await Account.findByIdAndDelete(id);
  }
}

module.exports = new AccountDao();