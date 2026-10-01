// Test the optimized aggregate endpoint performance
const testWallet = '0xf239109753C236aaF25A3EE69A30dBFD9c622548'

async function testEndpoint(url, name, iterations = 3) {
  console.log(`\nTesting ${name}...`)
  const times = []
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now()
    
    try {
      const response = await fetch(url)
      const duration = Date.now() - start
      
      if (!response.ok) {
        console.log(`❌ ${name} (attempt ${i+1}): HTTP ${response.status}`)
        continue
      }
      
      const data = await response.json()
      const size = JSON.stringify(data).length
      
      console.log(`✅ ${name} (attempt ${i+1}): ${duration}ms, ${size} bytes`)
      times.push(duration)
      
    } catch (error) {
      console.log(`❌ ${name} (attempt ${i+1}): Error - ${error.message}`)
    }
  }
  
  if (times.length > 0) {
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    const min = Math.min(...times)
    const max = Math.max(...times)
    console.log(`📊 ${name} Summary: avg=${avg}ms, min=${min}ms, max=${max}ms`)
    return { avg, min, max, times }
  }
  
  return null
}

async function runPerformanceTest() {
  console.log('🚀 Optimized Aggregate Endpoint Performance Test')
  console.log('================================================')
  
  const result = await testEndpoint(
    `http://localhost:3000/api/leaderboard/aggregate?wallet=${testWallet}`,
    'Optimized Aggregate Endpoint',
    5
  )
  
  if (result) {
    console.log('\n📈 Performance Analysis')
    console.log('=======================')
    console.log(`⚡ Average response time: ${result.avg}ms`)
    console.log(`🏃 Fastest response: ${result.min}ms`)
    console.log(`🐌 Slowest response: ${result.max}ms`)
    
    if (result.avg < 2000) {
      console.log('✅ Excellent performance! (< 2s average)')
    } else if (result.avg < 4000) {
      console.log('⚠️  Good performance (2-4s average)')
    } else {
      console.log('❌ Needs optimization (> 4s average)')
    }
  }
}

// Run the test
runPerformanceTest().catch(console.error)





