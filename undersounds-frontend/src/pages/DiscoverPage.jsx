import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardMedia, CardContent, Typography, CardActionArea, Button } from "@mui/material";
import Grid2 from "@mui/material/Grid2";
import { fetchAlbums } from '../services/jamendoService';
import { merchService } from '../services/merchandisingService';

const DiscoverPage = () => {
    const location = useLocation();
    const query = new URLSearchParams(location.search);
    const initialFilter = query.get("filter") || "all";
    const [selectedFilter, setSelectedFilter] = useState(initialFilter);
    const [selectedGenre, setSelectedGenre] = useState(initialFilter);
    const navigate = useNavigate();

    const [albums, setAlbums] = useState([]);
    const [merch, setMerch] = useState([]);

    const genreCarouselRef = useRef(null);

    const scrollLeft = () => {
        genreCarouselRef.current?.scrollBy({ left: -200, behavior: "smooth" });
    };

    const scrollRight = () => {
        genreCarouselRef.current?.scrollBy({ left: 200, behavior: "smooth" });
    };

    useEffect(() => {
        const loadData = async () => {
            try {
                const albumsData = await fetchAlbums();
                setAlbums(albumsData);
            } catch (error) {
                console.error("Error fetching data from Jamendo:", error);
            }
        };
        loadData();
    }, []);

    useEffect(() => {
        const loadMerch = async () => {
            try {
                const merchData = await merchService.getAllMerch();
                setMerch(merchData);
            } catch (error) {
                console.error("Error fetching merch:", error);
            }
        };
        loadMerch();
    }, []);

    useEffect(() => {
        const filterParam = query.get("filter") || "all";
        setSelectedFilter(filterParam);
        setSelectedGenre(filterParam);
    }, [location.search]);

    const handleAlbumClick = (album) => {
        navigate(`/album/${album.id}`, { state: { album } });
    };
    
    const handleTshirtClick = (tshirt_Id) => {
        navigate(`/tshirt/${tshirt_Id}`);
    };

    const handleGenreFilterChange = (newFilter) => {
        setSelectedFilter(newFilter);
        setSelectedGenre(newFilter);
        navigate(`/discover?filter=${newFilter}`);
    };

    const specialFilters = new Set(["vinyl", "cds", "cassettes", "tshirts"]);
    
    let filteredAlbums = [];
    let filteredMerch = [];

    if (selectedFilter === "all") {
        filteredAlbums = albums;
        filteredMerch = merch;
    } else if (specialFilters.has(selectedFilter)) {
        if (selectedFilter === "vinyl") {
            filteredMerch = merch.filter((m) => m.type === 0);
        } else if (selectedFilter === "cds") {
            filteredMerch = merch.filter((m) => m.type === 1);
        } else if (selectedFilter === "cassettes") {
            filteredMerch = merch.filter((m) => m.type === 2);
        } else if (selectedFilter === "tshirts") {
            filteredMerch = merch.filter((m) => m.type === 3);
        }
    } else {
        filteredAlbums = albums.filter(
            (album) => album.genre?.toLowerCase() === selectedFilter.toLowerCase()
        );
    }

    const genres = [
        "all", "ambient", "electronic", "pop", "rock", "jazz", "classical",
        "hiphop", "blues", "reggae", "metal", "indie", "folk", "latin",
        "country", "techno", "house", "trance", "dubstep", "soul", "rnb",
        "punk", "electropop", "synthwave", "dancehall", "grunge", "disco", 
        "trap", "bluesrock", "housemusic", "dub", "newwave", "hardrock", "chillwave"
    ];

    const genreCarouselStyle = {
        display: "flex",
        overflowX: "auto",
        scrollBehavior: "smooth",
        gap: "10px",
        padding: "10px 0",
        backgroundColor: "#4F6872",
        boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.1)",
        flex: 1,
        msOverflowStyle: "none",
        scrollbarWidth: "none",
    };

    return (
        <div>
            {(!specialFilters.has(selectedFilter) || selectedFilter === "all") && (
                <div style={{ display: "flex", alignItems: "center", marginBottom: "20px" }}>
                    <button
                        onClick={scrollLeft}
                        style={{
                            backgroundColor: "#1DA0C3",
                            color: "white",
                            border: "none",
                            borderRadius: "50%",
                            width: "30px",
                            height: "30px",
                            cursor: "pointer",
                            marginRight: "10px",
                        }}
                    >
                        {"<"}
                    </button>
                    <div ref={genreCarouselRef} style={genreCarouselStyle}>
                        {genres.map((genre) => (
                            <Button
                                key={genre}
                                variant="contained"
                                onClick={() => handleGenreFilterChange(genre)}
                                sx={{
                                    mx: 1,
                                    backgroundColor: selectedGenre === genre ? '#1DA0C3' : '#ffffff',
                                    color: selectedGenre === genre ? 'white' : '#333333',
                                    minWidth: '120px',
                                    height: '36px',
                                    textTransform: 'capitalize',
                                    fontWeight: selectedGenre === genre ? 'bold' : 'normal',
                                    '&:hover': {
                                        backgroundColor: selectedGenre === genre ? '#1788a3' : '#e0e0e0',
                                    },
                                }}
                            >
                                {genre.charAt(0).toUpperCase() + genre.slice(1)}
                            </Button>
                        ))}
                    </div>
                    <button
                        onClick={scrollRight}
                        style={{
                            backgroundColor: "#1DA0C3",
                            color: "white",
                            border: "none",
                            borderRadius: "50%",
                            width: "30px",
                            height: "30px",
                            cursor: "pointer",
                            marginLeft: "10px",
                        }}
                    >
                        {">"}
                    </button>
                </div>
            )}
            <Grid2 container spacing={2}>
                {filteredAlbums.map((album) => (
                    <Grid2 size={{ xs: 12, sm: 6, md: 4 }} key={album.id}>
                        <Card
                            sx={{
                                borderRadius: "12px", 
                                boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.15)",
                                transition: "transform 0.3s ease-in-out, filter 0.3s ease-in-out",
                                transform: "scale(0.95)",
                                "&:hover": {
                                    transform: "scale(1.02)",
                                    filter: "brightness(0.8)",
                                }
                            }}
                        >
                            <CardActionArea onClick={() => handleAlbumClick(album)}>
                                <CardMedia
                                    component="img"
                                    alt={`${album.name} cover`}
                                    image={album.coverImage}
                                    sx={{
                                        aspectRatio: "1 / 1", 
                                        padding: "20px",
                                        borderRadius: "12px 12px 0 0"
                                    }}
                                />
                                <CardContent sx={{ textAlign: "center", backgroundColor: "#fafafa" }}>
                                    <Typography 
                                        gutterBottom 
                                        variant="h6" 
                                        sx={{ fontWeight: "bold", color: "#333" }}
                                    >
                                        {album.title}
                                    </Typography>
                                    <Typography 
                                        variant="body2" 
                                        sx={{ color: "#555", fontStyle: "italic", marginBottom: "5px" }}
                                    >
                                        by {album.artist}
                                    </Typography>
                                    <Typography 
                                        variant="body2" 
                                        sx={{ color: "#777", fontWeight: "500" }}
                                    >
                                        Genre: {album.genre}
                                    </Typography>
                                    {(selectedFilter === "vinyl" || selectedFilter === "cds" || selectedFilter === "cassettes") && (
                                        <Typography 
                                            variant="h6" 
                                            sx={{ color: "#1976d2", fontWeight: "bold", marginTop: "8px" }}
                                        >
                                            ${album.price?.toFixed(2)}
                                        </Typography>
                                    )}
                                </CardContent>
                            </CardActionArea>
                        </Card>
                    </Grid2>
                ))}

                {filteredMerch.map((m) => (
                    <Grid2 size={{ xs: 12, sm: 6, md: 4 }} key={m.id ?? m._id}>
                        <Card
                            sx={{
                                borderRadius: "12px",
                                boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.15)",
                                transition: "transform 0.3s ease-in-out, filter 0.3s ease-in-out",
                                transform: "scale(0.95)",
                                marginBottom: "30px",
                                "&:hover": {
                                    transform: "scale(1.02)",
                                    filter: "brightness(0.8)"
                                }
                            }}
                        >
                            <CardActionArea onClick={() => handleTshirtClick(m._id)}>
                                <CardMedia
                                    component="img"
                                    alt={`${m.name} shirt`}
                                    image={m.image}
                                    sx={{
                                        aspectRatio: "1 / 1", 
                                        padding: "20px", 
                                        borderRadius: "12px 12px 0 0"
                                    }}
                                />
                                <CardContent sx={{ textAlign: "center", backgroundColor: "#fafafa" }}>
                                    <Typography 
                                        gutterBottom 
                                        variant="h6" 
                                        sx={{ fontWeight: "bold", color: "#333" }}
                                    >
                                        {m.name}
                                    </Typography>
                                    <Typography 
                                        variant="h6" 
                                        sx={{ color: "#1976d2", fontWeight: "bold", marginTop: "8px" }}
                                    >
                                        ${m.price?.toFixed(2)}
                                    </Typography>
                                </CardContent>
                            </CardActionArea>
                        </Card>
                    </Grid2>
                ))}
            </Grid2>
        </div>
    );
};

export default DiscoverPage;