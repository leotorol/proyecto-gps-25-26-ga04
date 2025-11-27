function AlbumDTO(album) {
  const dto = {
    id: album._id || album.id,
    title: album.title,
    coverImage: album.coverImage,
    price: album.price,
    releaseYear: album.releaseYear,
    genre: album.genre,
    tracks: album.tracks,
    ratings: album.ratings,
    vinyl: album.vinyl,
    cd: album.cd,
    cassettes: album.cassettes,
    destacado: album.destacado,
    description: album.description,
    label: album.label,
    updatedAt: album.updatedAt
  };

  // Extraer tanto el nombre como el ID numérico del artista correctamente
  if (album.artist) {
    if (typeof album.artist === 'object') {
      dto.artist = album.artist.name || album.artist.bandName || 'Unknown Artist';
      dto.artistId = album.artist.id ?? null;
    } else {
      dto.artist = 'Unknown Artist';
      dto.artistId = album.artist;
    }
  } else {
    dto.artist = 'Unknown Artist';
    dto.artistId = null;
  }

  return dto;
}

module.exports = AlbumDTO;