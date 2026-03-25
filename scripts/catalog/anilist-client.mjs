const ANILIST_API_URL = 'https://graphql.anilist.co';

const MEDIA_QUERY = `
  query DiscoverMedia(
    $page: Int!
    $perPage: Int!
    $type: MediaType!
    $sort: [MediaSort!]
    $isAdult: Boolean
    $formatIn: [MediaFormat!]
    $status: MediaStatus
    $countryOfOrigin: CountryCode
    $averageScoreGreater: Int
    $popularityGreater: Int
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
      }
      media(
        type: $type
        sort: $sort
        isAdult: $isAdult
        format_in: $formatIn
        status: $status
        countryOfOrigin: $countryOfOrigin
        averageScore_greater: $averageScoreGreater
        popularity_greater: $popularityGreater
      ) {
        id
        idMal
        type
        format
        status
        season
        seasonYear
        episodes
        duration
        chapters
        volumes
        countryOfOrigin
        isAdult
        popularity
        averageScore
        meanScore
        favourites
        hashtag
        description(asHtml: false)
        siteUrl
        title {
          romaji
          english
          native
        }
        synonyms
        coverImage {
          extraLarge
          large
        }
        bannerImage
        genres
        tags {
          name
          rank
        }
        startDate {
          year
          month
          day
        }
        endDate {
          year
          month
          day
        }
        studios {
          nodes {
            name
            isAnimationStudio
          }
        }
        trailer {
          id
          site
          thumbnail
        }
        nextAiringEpisode {
          airingAt
          timeUntilAiring
          episode
        }
        characters(sort: ROLE, perPage: 12) {
          edges {
            role
            node {
              id
              name { full native }
              image { large }
            }
            voiceActors(language: JAPANESE) {
              id
              name { full native }
              image { large }
            }
          }
        }
        staff(perPage: 8) {
          edges {
            role
            node {
              id
              name { full native }
              image { large }
            }
          }
        }
      }
    }
  }
`;

export async function fetchAniListPage({
  page = 1,
  perPage = 25,
  type = 'ANIME',
  sort = ['POPULARITY_DESC'],
  isAdult = false,
  formatIn,
  status,
  countryOfOrigin,
  averageScoreGreater,
  popularityGreater,
}) {
  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      query: MEDIA_QUERY,
      variables: {
        page,
        perPage,
        type,
        sort,
        isAdult,
        formatIn,
        status,
        countryOfOrigin,
        averageScoreGreater,
        popularityGreater,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`AniList request failed with ${response.status}`);
  }

  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join('; '));
  }

  return json.data.Page;
}
