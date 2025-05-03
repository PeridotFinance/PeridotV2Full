"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { motion } from "framer-motion"

export default function EasyModeLoading() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <Skeleton className="h-8 w-40 mb-2" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      
      <Card className="mb-8">
        <CardHeader>
          <Skeleton className="h-6 w-48 mx-auto" />
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-6 py-8">
          <motion.div
            className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Skeleton className="h-10 w-10 rounded-full" />
          </motion.div>
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-4 w-5/6 max-w-md" />
          <Skeleton className="h-10 w-40" />
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-16 mb-2" />
              <Skeleton className="h-8 w-24 mb-1" />
              <Skeleton className="h-3 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
      
      <Skeleton className="h-10 w-[300px] mb-6" />
      
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4 flex justify-between items-center">
              <div className="flex items-center">
                <Skeleton className="h-8 w-8 rounded-full mr-3" />
                <div>
                  <Skeleton className="h-4 w-20 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-6 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
} 