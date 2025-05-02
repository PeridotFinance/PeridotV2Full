export type Author = {
  name: string
  picture: string
}

export type Post = {
  slug: string
  title: string
  excerpt: string
  coverImage: string
  date: string
  author: Author
  category: string
  tags: string[]
  content: string
}

export type TableOfContentsItem = {
  level: number
  title: string
  slug: string
}
