"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2, Copy, Upload, Share, Settings } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import LZString from "lz-string" // Import lz-string

interface Shareholder {
  name: string
  shares: number
  percentage: number
}

interface FundingRound {
  id: string
  name: string
  currency: "GBP" | "USD" | "EUR" // Added EUR
  investmentAmount: number
  valuationType: "pre-money" | "post-money"
  valuationSource: "manual" | "reference"
  manualValuation: number
  referenceRoundId: string
  discountPercentage: number
  calculatedValuation: number
  preMoneyValuation: number
  postMoneyValuation: number
  newInvestorName: string
  capTable: Shareholder[]
}

interface ExchangeRates {
  "USD-GBP": number
  "GBP-USD": number
  "USD-EUR": number // Added USD-EUR
  "EUR-USD": number // Added EUR-USD
  "GBP-EUR": number // Added GBP-EUR
  "EUR-GBP": number // Added EUR-GBP
}

interface SavedState {
  founderName: string
  rounds: Omit<FundingRound, "capTable">[]
  // Only store the primary rates in the config
  exchangeRates?: {
    "USD-GBP": number
    "USD-EUR": number
  }
}

// Default exchange rates (primary rates)
const DEFAULT_PRIMARY_EXCHANGE_RATES = {
  "USD-GBP": 0.79,
  "USD-EUR": 0.92,
}

// Function to derive all exchange rates from primary ones
const deriveAllExchangeRates = (primaryRates: { "USD-GBP": number; "USD-EUR": number }): ExchangeRates => {
  const usdGbp = primaryRates["USD-GBP"]
  const usdEur = primaryRates["USD-EUR"]

  const gbpUsd = usdGbp > 0 ? 1 / usdGbp : 0
  const gbpEur = usdGbp > 0 ? usdEur / usdGbp : 0 // GBP to USD * USD to EUR
  const eurGbp = usdEur > 0 ? usdGbp / usdEur : 0 // EUR to USD * USD to GBP
  const eurUsd = usdEur > 0 ? 1 / usdEur : 0 // Fixed: should be 1 / usdEur

  return {
    "USD-GBP": usdGbp,
    "GBP-USD": Number(gbpUsd.toFixed(4)),
    "USD-EUR": usdEur,
    "EUR-USD": Number(eurUsd.toFixed(4)),
    "GBP-EUR": Number(gbpEur.toFixed(4)),
    "EUR-GBP": Number(eurGbp.toFixed(4)),
  }
}

export default function StartupDilutionCalculator() {
  const [founderName, setFounderName] = useState("Founders")
  const [rounds, setRounds] = useState<FundingRound[]>([])
  const [primaryExchangeRates, setPrimaryExchangeRates] = useState(DEFAULT_PRIMARY_EXCHANGE_RATES)
  const [allExchangeRates, setAllExchangeRates] = useState<ExchangeRates>(
    deriveAllExchangeRates(DEFAULT_PRIMARY_EXCHANGE_RATES),
  )
  const [saveString, setSaveString] = useState("")
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showExchangeSettings, setShowExchangeSettings] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState("")

  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()

  // Update allExchangeRates whenever primaryExchangeRates change
  useEffect(() => {
    setAllExchangeRates(deriveAllExchangeRates(primaryExchangeRates))
  }, [primaryExchangeRates])

  // Recalculate all rounds when exchange rates change
  useEffect(() => {
    // Only recalculate if there are rounds to avoid unnecessary initial calculations
    if (rounds.length > 0) {
      setRounds((prevRounds) => recalculateAllRounds(prevRounds))
    }
  }, [allExchangeRates]) // Dependency on allExchangeRates

  // Load state from URL on mount
  useEffect(() => {
    const stateParam = searchParams.get("state")
    if (stateParam) {
      try {
        // Decompress the state from the URL using the correct LZString method
        const decompressedState = LZString.decompressFromEncodedURIComponent(stateParam)
        if (decompressedState) {
          const parsedState = JSON.parse(decompressedState)
          loadState(parsedState)
          toast({
            title: "State loaded",
            description: "Configuration loaded from URL successfully",
          })
        } else {
          throw new Error("Decompression failed or invalid URL string")
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to load state from URL",
          variant: "destructive",
        })
      }
    }
  }, [searchParams])

  // Clear feedback message after 5 seconds
  useEffect(() => {
    if (feedbackMessage) {
      const timer = setTimeout(() => {
        setFeedbackMessage("")
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [feedbackMessage])

  const convertCurrency = (amount: number, fromCurrency: string, toCurrency: string): number => {
    if (fromCurrency === toCurrency) return amount
    const rateKey = `${fromCurrency}-${toCurrency}` as keyof ExchangeRates
    const rate = allExchangeRates[rateKey]
    return amount * (rate || 1)
  }

  const addRound = () => {
    const roundNumber = rounds.length + 1
    const newRound: FundingRound = {
      id: `round-${Date.now()}`,
      name: `Series ${String.fromCharCode(64 + roundNumber)}`,
      currency: "USD",
      investmentAmount: 0,
      valuationType: "pre-money",
      valuationSource: "manual",
      manualValuation: 0,
      referenceRoundId: "",
      discountPercentage: 0,
      calculatedValuation: 0,
      preMoneyValuation: 0,
      postMoneyValuation: 0,
      newInvestorName: `Series ${String.fromCharCode(64 + roundNumber)} Investor`,
      capTable: [],
    }
    setRounds([...rounds, newRound])
  }

  const calculateValuation = (round: FundingRound, allRounds: FundingRound[] = rounds): number => {
    if (round.valuationSource === "manual") {
      return round.manualValuation
    }

    // Reference valuation from another round (only future rounds)
    const referenceRound = allRounds.find((r) => r.id === round.referenceRoundId)
    if (!referenceRound) return 0

    // Get the appropriate valuation from reference round
    let referenceValuation =
      round.valuationType === "pre-money" ? referenceRound.preMoneyValuation : referenceRound.postMoneyValuation

    if (referenceValuation <= 0) return 0

    // Convert currency if needed
    referenceValuation = convertCurrency(referenceValuation, referenceRound.currency, round.currency)

    // Apply discount
    const discountMultiplier = (100 - round.discountPercentage) / 100
    return referenceValuation * discountMultiplier
  }

  const recalculateAllRounds = (updatedRounds: FundingRound[]): FundingRound[] => {
    const result: FundingRound[] = []

    for (let i = 0; i < updatedRounds.length; i++) {
      const round = updatedRounds[i]

      // Recalculate valuation
      const calculatedValuation = calculateValuation(round, updatedRounds)

      // Calculate pre-money and post-money based on valuation type
      let preMoneyValuation: number
      let postMoneyValuation: number

      if (round.valuationType === "pre-money") {
        preMoneyValuation = calculatedValuation
        postMoneyValuation = preMoneyValuation + round.investmentAmount
      } else {
        postMoneyValuation = calculatedValuation
        preMoneyValuation = Math.max(0, postMoneyValuation - round.investmentAmount)
      }

      // Calculate cap table using the already-calculated previous rounds
      const capTable = calculateCapTableForRound(
        { ...round, preMoneyValuation, postMoneyValuation },
        i,
        result, // Use the already-calculated rounds, not the original updatedRounds
      )

      // Add the fully calculated round to our result
      result.push({
        ...round,
        calculatedValuation,
        preMoneyValuation,
        postMoneyValuation,
        capTable,
      })
    }

    return result
  }

  const updateRound = (roundId: string, field: keyof FundingRound, value: any) => {
    setRounds((prevRounds) => {
      const updatedRounds = prevRounds.map((round) => {
        if (round.id === roundId) {
          return { ...round, [field]: value }
        }
        return round
      })

      // Recalculate all rounds
      return recalculateAllRounds(updatedRounds)
    })
  }

  const calculateCapTableForRound = (
    currentRound: FundingRound,
    currentRoundIndex: number,
    allRounds: FundingRound[],
  ): Shareholder[] => {
    if (currentRound.postMoneyValuation <= 0 || currentRound.investmentAmount <= 0) return []

    // Get the cap table from the previous round, or start with founders
    let previousCapTable: Shareholder[] = []

    if (currentRoundIndex === 0) {
      // First round - start with founders having 100%
      previousCapTable = [{ name: founderName, shares: 1000000, percentage: 100 }]
    } else if (currentRoundIndex <= allRounds.length) {
      // Get cap table from previous round - use the most recent available
      const previousRoundIndex = Math.min(currentRoundIndex - 1, allRounds.length - 1)
      const previousRound = allRounds[previousRoundIndex]

      if (previousRound && previousRound.capTable && previousRound.capTable.length > 0) {
        previousCapTable = [...previousRound.capTable]
      } else {
        // Fallback to founders if previous round has no cap table
        previousCapTable = [{ name: founderName, shares: 1000000, percentage: 100 }]
      }
    } else {
      // Fallback to founders
      previousCapTable = [{ name: founderName, shares: 1000000, percentage: 100 }]
    }

    // Calculate new investor ownership percentage
    const newInvestorPercentage = (currentRound.investmentAmount / currentRound.postMoneyValuation) * 100

    // Validate that the new investor percentage is reasonable
    if (newInvestorPercentage <= 0 || newInvestorPercentage >= 100) {
      return previousCapTable // Return previous cap table if calculation is invalid
    }

    // Calculate dilution factor for existing shareholders
    const dilutionFactor = (100 - newInvestorPercentage) / 100

    // Create new cap table
    const newCapTable: Shareholder[] = []

    // Add diluted existing shareholders
    previousCapTable.forEach((shareholder) => {
      const newPercentage = shareholder.percentage * dilutionFactor
      if (newPercentage > 0.01) {
        // Only include if ownership is meaningful (>0.01%)
        newCapTable.push({
          name: shareholder.name,
          shares: Math.round(shareholder.shares * dilutionFactor),
          percentage: newPercentage,
        })
      }
    })

    // Add new investor
    const newInvestorShares = Math.round((newInvestorPercentage / 100) * 1000000)
    newCapTable.push({
      name: currentRound.newInvestorName,
      shares: newInvestorShares,
      percentage: newInvestorPercentage,
    })

    return newCapTable
  }

  const removeRound = (roundId: string) => {
    setRounds((prevRounds) => {
      // Remove the round
      const filteredRounds = prevRounds.filter((round) => round.id !== roundId)

      // Clear any references to the deleted round
      const cleanedRounds = filteredRounds.map((round) => {
        if (round.referenceRoundId === roundId) {
          return {
            ...round,
            referenceRoundId: "",
            valuationSource: "manual" as const,
          }
        }
        return round
      })

      // Recalculate all rounds
      return recalculateAllRounds(cleanedRounds)
    })
  }

  const formatCurrency = (amount: number, currency: string) => {
    const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$"
    return `${symbol}${amount.toLocaleString()}`
  }

  const getInitialCapTable = (): Shareholder[] => {
    return [{ name: founderName, shares: 1000000, percentage: 100 }]
  }

  // Get available rounds for reference (only future rounds to avoid cycles)
  const getAvailableReferenceRounds = (currentRoundId: string) => {
    const currentIndex = rounds.findIndex((r) => r.id === currentRoundId)
    return rounds.slice(currentIndex + 1).filter((r) => r.postMoneyValuation > 0)
  }

  // Generates the full, uncompressed JSON string for copy/paste
  const generateFullSaveString = (): string => {
    const state: SavedState = {
      founderName,
      rounds: rounds.map(({ capTable, ...round }) => round), // Exclude capTable as it's calculated
      exchangeRates: primaryExchangeRates, // Only store primary rates
    }
    return JSON.stringify(state, null, 2) // Pretty print for readability
  }

  // Generates the compressed string for URL sharing
  const generateCompressedSaveString = (): string => {
    const state: SavedState = {
      founderName,
      rounds: rounds.map(({ capTable, ...round }) => round),
      exchangeRates: primaryExchangeRates,
    }
    // Use compressToEncodedURIComponent directly for URL-safe output
    return LZString.compressToEncodedURIComponent(JSON.stringify(state))
  }

  const loadState = (state: SavedState) => {
    setFounderName(state.founderName)

    // Load primary exchange rates if provided, otherwise use defaults
    if (state.exchangeRates) {
      setPrimaryExchangeRates(state.exchangeRates)
    } else {
      setPrimaryExchangeRates(DEFAULT_PRIMARY_EXCHANGE_RATES)
    }

    // Restore rounds without cap tables (they'll be recalculated)
    const restoredRounds = state.rounds.map((roundData) => ({
      ...roundData,
      capTable: [], // Will be recalculated
    }))

    // Set rounds and recalculate everything
    setRounds(recalculateAllRounds(restoredRounds))
  }

  const handleCopyState = () => {
    const stateString = generateFullSaveString() // Use the full, readable string
    navigator.clipboard.writeText(stateString)
    setFeedbackMessage("Config copied to clipboard!")
    toast({
      title: "Copied!",
      description: "Configuration copied to clipboard",
    })
  }

  const handleLoadState = () => {
    try {
      // For loading from textarea, assume it's either compressed (from URL copy) or uncompressed
      let parsedState: SavedState
      try {
        // Try to parse directly (uncompressed)
        parsedState = JSON.parse(saveString)
      } catch (jsonError) {
        // If direct parse fails, try decompressing (assuming it's a URL-compressed string)
        const decompressedString = LZString.decompressFromBase64(saveString) // Use decompressFromBase64 for textarea input
        if (decompressedString) {
          parsedState = JSON.parse(decompressedString)
        } else {
          throw new Error("Decompression failed or invalid string")
        }
      }

      loadState(parsedState)
      setSaveString("")
      setShowSaveDialog(false)
      toast({
        title: "Loaded!",
        description: "Configuration loaded successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Invalid configuration string",
        variant: "destructive",
      })
    }
  }

  const handleShareURL = () => {
    const stateString = generateCompressedSaveString() // This now returns the URL-safe compressed string
    const url = `${window.location.origin}${window.location.pathname}?state=${stateString}` // No need for encodeURIComponent here
    navigator.clipboard.writeText(url)
    setFeedbackMessage("URL copied to clipboard!")
    toast({
      title: "URL Copied!",
      description: "Shareable URL copied to clipboard",
    })
  }

  // Update primary exchange rates
  const updatePrimaryExchangeRate = (key: "USD-GBP" | "USD-EUR", value: number) => {
    setPrimaryExchangeRates((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-gray-900">Startup Equity Dilution Calculator</h1>
          <p className="text-gray-600">Model how ownership changes through funding rounds</p>
        </div>

        {/* New explanatory text */}
        <p className="text-center text-sm text-gray-700 bg-gray-100 p-3 rounded-lg shadow-sm">
          To use this tool, start by adjusting the "Initial Ownership" and then add "Funding Rounds" below. Make changes
          to investment amounts, valuations, and currencies as needed. You can save your current configuration by
          clicking "Copy Config" and pasting it somewhere safe, or generate a shareable URL with "Share URL". **All
          calculations and data are processed purely client-side in your browser; nothing is stored on a server.**
        </p>

        {/* Save/Load Controls */}
        <Card className="bg-white border shadow-sm">
          <CardContent className="py-4">
            <div className="space-y-3">
              {feedbackMessage && (
                <div className="text-center">
                  <span className="text-sm text-gray-700 bg-gray-100 px-3 py-1 rounded-full animate-pulse">
                    {feedbackMessage}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-3 justify-center">
                <Button onClick={handleCopyState} variant="outline" size="sm">
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Config
                </Button>
                <Button onClick={() => setShowSaveDialog(!showSaveDialog)} variant="outline" size="sm">
                  <Upload className="h-4 w-4 mr-2" />
                  Load Config
                </Button>
                <Button onClick={handleShareURL} variant="outline" size="sm">
                  <Share className="h-4 w-4 mr-2" />
                  Share URL
                </Button>
              </div>
            </div>
            {showSaveDialog && (
              <div className="mt-4 space-y-3">
                <Label htmlFor="saveString" className="text-sm text-gray-700">
                  Paste Configuration String:
                </Label>
                <Textarea
                  id="saveString"
                  value={saveString}
                  onChange={(e) => setSaveString(e.target.value)}
                  placeholder="Paste your configuration string here..."
                  className="h-16 text-sm border-gray-300 focus:border-gray-500"
                />
                <Button onClick={handleLoadState} size="sm">
                  Apply Configuration
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        {/* Exchange Rate Settings */}
        <Card className="bg-white border shadow-sm">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm text-gray-700">
                  <strong>Exchange Rates:</strong> 1 USD = {allExchangeRates["USD-GBP"]} GBP | 1 USD ={" "}
                  {allExchangeRates["USD-EUR"]} EUR
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  1 GBP = {allExchangeRates["GBP-USD"]} USD | 1 EUR = {allExchangeRates["EUR-USD"]} USD
                </p>
                <p className="text-xs text-gray-500">
                  1 GBP = {allExchangeRates["GBP-EUR"]} EUR | 1 EUR = {allExchangeRates["EUR-GBP"]} GBP
                </p>
              </div>
              <Button
                onClick={() => setShowExchangeSettings(!showExchangeSettings)}
                variant="ghost"
                size="sm"
                className="text-gray-600 hover:text-gray-800"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
            {showExchangeSettings && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="usd-gbp-rate" className="text-sm text-gray-700">
                    USD to GBP Rate
                  </Label>
                  <Input
                    id="usd-gbp-rate"
                    type="number"
                    step="0.0001"
                    value={primaryExchangeRates["USD-GBP"]}
                    onChange={(e) => updatePrimaryExchangeRate("USD-GBP", Number(e.target.value))}
                    className="mt-1 border-gray-300 focus:border-gray-500"
                  />
                </div>
                <div>
                  <Label htmlFor="usd-eur-rate" className="text-sm text-gray-700">
                    USD to EUR Rate
                  </Label>
                  <Input
                    id="usd-eur-rate"
                    type="number"
                    step="0.0001"
                    value={primaryExchangeRates["USD-EUR"]}
                    onChange={(e) => updatePrimaryExchangeRate("USD-EUR", Number(e.target.value))}
                    className="mt-1 border-gray-300 focus:border-gray-500"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        {/* Initial Founders Section */}
        <Card className="bg-white border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-gray-800 text-lg">🚀 Initial Ownership</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="founderName" className="text-sm text-gray-700">
                Founder/Team Name
              </Label>
              <Input
                id="founderName"
                value={founderName}
                onChange={(e) => setFounderName(e.target.value)}
                placeholder="Enter founder or team name"
                className="mt-1 border-gray-300 focus:border-gray-500"
              />
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <h4 className="font-medium mb-2 text-sm text-gray-800">Cap Table</h4>
              <div className="space-y-1">
                {getInitialCapTable().map((shareholder, index) => (
                  <div key={index} className="flex justify-between items-center py-1 px-2 bg-white rounded text-sm">
                    <span className="font-medium text-gray-800">{shareholder.name}</span>
                    <div className="text-right">
                      <span className="font-semibold text-gray-900">{shareholder.percentage.toFixed(1)}%</span>
                      <span className="text-xs text-gray-500 ml-2">{shareholder.shares.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Funding Rounds */}
        {rounds.map((round, index) => (
          <Card key={round.id} className="bg-white border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-gray-800 text-lg">
                <span className="flex items-center gap-2">💰 {round.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRound(round.id)}
                  className="text-gray-600 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Basic Info Row */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <Label htmlFor={`round-name-${round.id}`} className="text-sm text-gray-700">
                    Round Name
                  </Label>
                  <Input
                    id={`round-name-${round.id}`}
                    value={round.name}
                    onChange={(e) => updateRound(round.id, "name", e.target.value)}
                    className="mt-1 border-gray-300 focus:border-gray-500"
                  />
                </div>

                <div>
                  <Label htmlFor={`currency-${round.id}`} className="text-sm text-gray-700">
                    Currency
                  </Label>
                  <Select
                    value={round.currency}
                    onValueChange={(value) => updateRound(round.id, "currency", value as "USD" | "GBP" | "EUR")}
                  >
                    <SelectTrigger className="mt-1 border-gray-300 focus:border-gray-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor={`investment-${round.id}`} className="text-sm text-gray-700">
                    Investment Amount
                  </Label>
                  <Input
                    id={`investment-${round.id}`}
                    type="number"
                    value={round.investmentAmount || ""}
                    onChange={(e) => updateRound(round.id, "investmentAmount", Number(e.target.value))}
                    placeholder="0"
                    className="mt-1 border-gray-300 focus:border-gray-500"
                  />
                </div>

                <div>
                  <Label htmlFor={`investor-name-${round.id}`} className="text-sm text-gray-700">
                    New Investor
                  </Label>
                  <Input
                    id={`investor-name-${round.id}`}
                    value={round.newInvestorName}
                    onChange={(e) => updateRound(round.id, "newInvestorName", e.target.value)}
                    placeholder="Investor name"
                    className="mt-1 border-gray-300 focus:border-gray-500"
                  />
                </div>
              </div>
              {/* Valuation Section */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-3">
                <h4 className="font-medium text-sm text-gray-800">Valuation Settings</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor={`valuation-type-${round.id}`} className="text-sm text-gray-700">
                      Valuation Type
                    </Label>
                    <Select
                      value={round.valuationType}
                      onValueChange={(value) => updateRound(round.id, "valuationType", value)}
                    >
                      <SelectTrigger className="mt-1 border-gray-300 focus:border-gray-500">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pre-money">Pre-Money</SelectItem>
                        <SelectItem value="post-money">Post-Money</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor={`valuation-source-${round.id}`} className="text-sm text-gray-700">
                      Valuation Source
                    </Label>
                    <Select
                      value={round.valuationSource}
                      onValueChange={(value) => updateRound(round.id, "valuationSource", value)}
                    >
                      <SelectTrigger className="mt-1 border-gray-300 focus:border-gray-500">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual Entry</SelectItem>
                        <SelectItem value="reference">Reference Future Round</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {round.valuationSource === "manual" ? (
                  <div>
                    <Label htmlFor={`manual-valuation-${round.id}`} className="text-sm text-gray-700">
                      {round.valuationType === "pre-money" ? "Pre-Money" : "Post-Money"} Valuation
                    </Label>
                    <Input
                      id={`manual-valuation-${round.id}`}
                      type="number"
                      value={round.manualValuation || ""}
                      onChange={(e) => updateRound(round.id, "manualValuation", Number(e.target.value))}
                      placeholder="0"
                      className="mt-1 border-gray-300 focus:border-gray-500"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`reference-round-${round.id}`} className="text-sm text-gray-700">
                        Reference Round
                      </Label>
                      <Select
                        value={round.referenceRoundId}
                        onValueChange={(value) => updateRound(round.id, "referenceRoundId", value)}
                      >
                        <SelectTrigger className="mt-1 border-gray-300 focus:border-gray-500">
                          <SelectValue placeholder="Select future round" />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableReferenceRounds(round.id).map((refRound) => (
                            <SelectItem key={refRound.id} value={refRound.id}>
                              {refRound.name} ({refRound.currency})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor={`discount-${round.id}`} className="text-sm text-gray-700">
                        Discount %
                      </Label>
                      <Input
                        id={`discount-${round.id}`}
                        type="number"
                        value={round.discountPercentage || ""}
                        onChange={(e) => updateRound(round.id, "discountPercentage", Number(e.target.value))}
                        placeholder="0"
                        min="0"
                        max="100"
                        className="mt-1 border-gray-300 focus:border-gray-500"
                      />
                    </div>
                  </div>
                )}
              </div>
              {round.postMoneyValuation > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1 text-sm text-gray-700">
                      <div className="flex justify-between">
                        <span>Pre-Money:</span>
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(round.preMoneyValuation, round.currency)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Investment:</span>
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(round.investmentAmount, round.currency)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-1 border-gray-200">
                        <span>Post-Money:</span>
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(round.postMoneyValuation, round.currency)}
                        </span>
                      </div>
                    </div>

                    {round.valuationSource === "reference" && round.referenceRoundId && (
                      <div className="text-xs text-gray-600 space-y-1">
                        <div>Source: {rounds.find((r) => r.id === round.referenceRoundId)?.name}</div>
                        {round.discountPercentage > 0 && <div>Discount: {round.discountPercentage}%</div>}
                        <div>Calculated: {formatCurrency(round.calculatedValuation, round.currency)}</div>
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium mb-2 text-sm text-gray-800">Cap Table After {round.name}</h4>
                    <div className="space-y-1">
                      {round.capTable.map((shareholder, index) => (
                        <div
                          key={index}
                          className="flex justify-between items-center py-1 px-2 bg-white rounded text-sm"
                        >
                          <span className="font-medium text-gray-800">{shareholder.name}</span>
                          <div className="text-right">
                            <span className="font-semibold text-gray-900">{shareholder.percentage.toFixed(1)}%</span>
                            <span className="text-xs text-gray-500 ml-2">{shareholder.shares.toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {/* Add Round Button */}
        <div className="text-center">
          <Button onClick={addRound} className="bg-gray-900 hover:bg-gray-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Add Funding Round
          </Button>
        </div>

        {/* Footer */}
        <footer className="text-center text-sm text-gray-600 mt-8 py-4 border-t border-gray-200">
          <p>
            This was made by{" "}
            <a
              href="https://linkedin.com/in/seyeddanesh"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Seyed Danesh
            </a>{" "}
            using{" "}
            <a
              href="https://v0.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              v0
            </a>{" "}
            deployed on{" "}
            <a
              href="https://vercel.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Vercel
            </a>
            .
          </p>
          <p className="mt-1">
            All code is running client side. If you want any features added, feel free to get in touch!
          </p>
        </footer>
      </div>
    </div>
  )
}
