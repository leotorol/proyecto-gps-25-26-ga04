function ArtistDTO(artist) {
  const dto = {
    _id: artist._id,
    id: artist.id,
    name: artist.name,
    profileImage: artist.profileImage,
    genre: artist.genre,
    bio: artist.bio,
    banner: artist.banner,
    seguidores: artist.seguidores,
    ubicacion: artist.ubicacion,
    albums: [],
    concerts: artist.concerts,
    merchandising: artist.merchandising,
    socialLinks: artist.socialLinks,
    createdAt: artist.createdAt,
    updatedAt: artist.updatedAt
  };

  dto.albums = Array.isArray(artist.albums)
    ? artist.albums.map(alb => (alb?._id ? {
        id: alb._id,
        title: alb.title,
        artist: alb.artist,
        genre: alb.genre,
        tracks: alb.tracks,
        ratings: alb.ratings,
        vinyl: alb.vinyl,
        cd: alb.cd,
        cassettes: alb.cassettes,
        destacado: alb.destacado,
        description: alb.description,
        label: alb.label,
        coverImage: alb.coverImage,
        releaseYear: alb.releaseYear,
        price: alb.price
      } : alb))
    : [];

  return dto;
}

module.exports = ArtistDTO;