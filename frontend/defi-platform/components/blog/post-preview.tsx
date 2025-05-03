import Link from "next/link"
import Image from "next/image"
import { Calendar, User } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import type { Post } from "@/types/blog"

interface PostPreviewProps {
  post: Post
}

export default function PostPreview({ post }: PostPreviewProps) {
  return (
    <Card className="bg-card border-border/50 overflow-hidden flex flex-col card-hover">
      <div className="relative h-48">
        <Image
          src={post.coverImage || `/placeholder.svg?height=300&width=500&query=${post.title}`}
          alt={post.title}
          fill
          className="object-cover"
        />
        <div className="absolute top-3 left-3 bg-primary/90 text-background px-2 py-1 rounded-full text-xs font-medium">
          {post.category}
        </div>
      </div>
      <CardHeader className="pb-2">
        <div className="flex items-center text-sm text-text/60 mb-1">
          <Calendar className="h-3 w-3 mr-1" />
          <span>
            {new Date(post.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        </div>
        <CardTitle className="text-xl">{post.title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-2 flex-grow">
        <CardDescription className="text-text/70">{post.excerpt}</CardDescription>
      </CardContent>
      <CardFooter className="pt-2 pb-4 flex items-center justify-between">
        <div className="flex items-center">
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center mr-2 overflow-hidden">
            {post.author.picture ? (
              <Image src={post.author.picture || "/placeholder.svg"} alt={post.author.name} width={24} height={24} />
            ) : (
              <User className="h-3 w-3" />
            )}
          </div>
          <span className="text-xs">{post.author.name}</span>
        </div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-primary hover:text-primary/90 hover:bg-primary/10 -mr-2"
        >
          <Link href={`/blog/${post.slug}`}>
            Read
            <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
