function NewsDTO(news) {
  return {
    id: news._id,
    titulo: news.titulo,
    body: news.body,
    image: news.image,
    fechaPublicacion: news.fechaPublicacion,
    autor: news.autor,
    createdAt: news.createdAt,
    updatedAt: news.updatedAt
  };
}

module.exports = NewsDTO;