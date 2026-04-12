interface NominatimResult {
  lat: string;
  lon: string;
}

export async function geocodificarDireccion(
  direccion: string
): Promise<{ latitud: number; longitud: number } | null> {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(direccion);

  const res = await fetch(url, {
    headers: { "User-Agent": "pets-backend/0.1.0" },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as NominatimResult[];
  if (!data.length) return null;

  return {
    latitud: parseFloat(data[0].lat),
    longitud: parseFloat(data[0].lon),
  };
}
