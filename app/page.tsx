"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2, Copy, Upload, Share, Settings, SplitSquareVertical } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import LZString from "lz-string"
import React from "react"
import { Switch } from "@/components/ui/switch"

interface Shareholder {
  name: string
  shares: number
  percentage: number
}

interface FundingRound {
  id: string
  type: "funding"
  name: string
  currency: "GBP" | "USD" | "EUR"
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
  order: number
}

interface OptionPool {
  id: string
  type: "option-pool"
  name: string
  percentage: number
  capTable: Shareholder[]
  order: number
}

type Event = FundingRound | OptionPool

interface ExchangeRates {
  "USD-GBP": number
  "GBP-USD": number
  "USD-EUR": number
  "EUR-USD": number
  "GBP-EUR": number
  "EUR-GBP": number
}

interface ModelData {
  founderName: string
  events: Event[]
}

interface SavedState {
  comparisonMode: boolean
  exchangeRates: {
    "USD-GBP": number
    "USD-EUR": number
  }
  modelA: {
    founderName: string
    events: Omit<Event, "capTable">[]
  }
  modelB?: {
    founderName: string
    events: Omit<Event, "capTable">[]
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
  const gbpEur = usdGbp > 0 ? usdEur / usdGbp : 0
  const eurGbp = usdEur > 0 ? usdGbp / usdEur : 0
  const eurUsd = usdEur > 0 ? 1 / usdEur : 0

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
  // State for comparison mode
  const [comparisonMode, setComparisonMode] = useState(false)

  // Model A state (primary model)
  const [founderNameA, setFounderNameA] = useState("Founders")
  const [eventsA, setEventsA] = useState<Event[]>([])

  // Model B state (comparison model)
  const [founderNameB, setFounderNameB] = useState("Founders")
  const [eventsB, setEventsB] = useState<Event[]>([])

  // Shared state
  const [primaryExchangeRates, setPrimaryExchangeRates] = useState(DEFAULT_PRIMARY_EXCHANGE_RATES)
  const [allExchangeRates, setAllExchangeRates] = useState<ExchangeRates>(
    deriveAllExchangeRates(DEFAULT_PRIMARY_EXCHANGE_RATES),
  )
  const [saveString, setSaveString] = useState("")
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showExchangeSettings, setShowExchangeSettings] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState("")
  const [activeInsertionPointA, setActiveInsertionPointA] = useState<string | null>(null)
  const [activeInsertionPointB, setActiveInsertionPointB] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("modelA")

  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()

  // Update allExchangeRates whenever primaryExchangeRates change
  useEffect(() => {
    setAllExchangeRates(deriveAllExchangeRates(primaryExchangeRates))
  }, [primaryExchangeRates])

  // Recalculate all events when exchange rates change
  useEffect(() => {
    if (eventsA.length > 0) {
      setEventsA((prevEvents) => recalculateAllEvents(prevEvents, founderNameA))
    }
    if (comparisonMode && eventsB.length > 0) {
      setEventsB((prevEvents) => recalculateAllEvents(prevEvents, founderNameB))
    }
  }, [allExchangeRates, founderNameA, founderNameB])

  // Load state from URL on mount
  useEffect(() => {
    const stateParam = searchParams.get("state")
    if (stateParam) {
      try {
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

  // Enable comparison mode
  const enableComparisonMode = () => {
    if (!comparisonMode) {
      // Clone model A to model B
      setFounderNameB(founderNameA)
      setEventsB(JSON.parse(JSON.stringify(eventsA)))
      setComparisonMode(true)
      setActiveTab("modelA")
      toast({
        title: "Comparison Mode Enabled",
        description: "You can now compare two different scenarios side by side",
      })
    }
  }

  // Disable comparison mode
  const disableComparisonMode = () => {
    if (comparisonMode) {
      setComparisonMode(false)
      setActiveTab("modelA")
      toast({
        title: "Comparison Mode Disabled",
        description: "Returned to single model view",
      })
    }
  }

  // Copy model A to B
  const copyModelAToB = () => {
    if (comparisonMode) {
      setFounderNameB(founderNameA)
      setEventsB(JSON.parse(JSON.stringify(eventsA)))
      toast({
        title: "Model Copied",
        description: "Model A has been copied to Model B",
      })
    }
  }

  // Copy model B to A
  const copyModelBToA = () => {
    if (comparisonMode) {
      setFounderNameA(founderNameB)
      setEventsA(JSON.parse(JSON.stringify(eventsB)))
      toast({
        title: "Model Copied",
        description: "Model B has been copied to Model A",
      })
    }
  }

  const convertCurrency = (amount: number, fromCurrency: string, toCurrency: string): number => {
    if (fromCurrency === toCurrency) return amount
    const rateKey = `${fromCurrency}-${toCurrency}` as keyof ExchangeRates
    const rate = allExchangeRates[rateKey]
    return amount * (rate || 1)
  }

  const getNextOrder = (events: Event[]) => {
    return events.length > 0 ? Math.max(...events.map((e) => e.order)) + 1 : 1
  }

  const addRound = (model: "A" | "B", insertAfterOrder?: number) => {
    const events = model === "A" ? eventsA : eventsB
    const setEvents = model === "A" ? setEventsA : setEventsB
    const setActiveInsertionPoint = model === "A" ? setActiveInsertionPointA : setActiveInsertionPointB
    const founderName = model === "A" ? founderNameA : founderNameB

    const roundNumber = events.filter((e) => e.type === "funding").length + 1
    let newOrder: number

    if (insertAfterOrder !== undefined) {
      // Insert after the specified order, shift subsequent events
      setEvents((prevEvents) => {
        const updatedEvents = prevEvents.map((event) => {
          if (event.order > insertAfterOrder) {
            return { ...event, order: event.order + 1 }
          }
          return event
        })

        newOrder = insertAfterOrder + 1

        const newRound: FundingRound = {
          id: `round-${Date.now()}-${model}`,
          type: "funding",
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
          order: newOrder,
        }

        return recalculateAllEvents([...updatedEvents, newRound], founderName)
      })
    } else {
      newOrder = getNextOrder(events)
      const newRound: FundingRound = {
        id: `round-${Date.now()}-${model}`,
        type: "funding",
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
        order: newOrder,
      }
      setEvents([...events, newRound])
    }
    setActiveInsertionPoint(null)
  }

  const addOptionPool = (model: "A" | "B", insertAfterOrder?: number) => {
    const events = model === "A" ? eventsA : eventsB
    const setEvents = model === "A" ? setEventsA : setEventsB
    const setActiveInsertionPoint = model === "A" ? setActiveInsertionPointA : setActiveInsertionPointB
    const founderName = model === "A" ? founderNameA : founderNameB

    const poolNumber = events.filter((e) => e.type === "option-pool").length + 1
    let newOrder: number

    if (insertAfterOrder !== undefined) {
      // Insert after the specified order, shift subsequent events
      setEvents((prevEvents) => {
        const updatedEvents = prevEvents.map((event) => {
          if (event.order > insertAfterOrder) {
            return { ...event, order: event.order + 1 }
          }
          return event
        })

        newOrder = insertAfterOrder + 1

        const newPool: OptionPool = {
          id: `pool-${Date.now()}-${model}`,
          type: "option-pool",
          name: `Option Pool ${poolNumber}`,
          percentage: 10,
          capTable: [],
          order: newOrder,
        }

        return recalculateAllEvents([...updatedEvents, newPool], founderName)
      })
    } else {
      newOrder = getNextOrder(events)
      const newPool: OptionPool = {
        id: `pool-${Date.now()}-${model}`,
        type: "option-pool",
        name: `Option Pool ${poolNumber}`,
        percentage: 10,
        capTable: [],
        order: newOrder,
      }
      setEvents(recalculateAllEvents([...events, newPool], founderName))
    }
    setActiveInsertionPoint(null)
  }

  const calculateValuation = (round: FundingRound, allEvents: Event[]): number => {
    if (round.valuationSource === "manual") {
      return round.manualValuation
    }

    // Reference valuation from another round (only future rounds)
    const referenceRound = allEvents.find(
      (e) => e.id === round.referenceRoundId && e.type === "funding",
    ) as FundingRound

    if (!referenceRound) {
      console.warn(`Reference round ${round.referenceRoundId} not found for round ${round.name}`)
      return 0
    }

    let referenceValuation =
      round.valuationType === "pre-money" ? referenceRound.preMoneyValuation : referenceRound.postMoneyValuation

    if (referenceValuation <= 0) {
      console.warn(`Reference round ${referenceRound.name} has no valuation yet`)
      return 0
    }

    // Convert currency if needed
    if (referenceRound.currency !== round.currency) {
      referenceValuation = convertCurrency(referenceValuation, referenceRound.currency, round.currency)
    }

    // Apply discount
    const discountMultiplier = (100 - round.discountPercentage) / 100
    const result = referenceValuation * discountMultiplier

    return result
  }

  const recalculateAllEvents = (updatedEvents: Event[], founderName: string): Event[] => {
    // Sort events by order
    const sortedEvents = [...updatedEvents].sort((a, b) => a.order - b.order)
    const result: Event[] = []
    let currentCapTable: Shareholder[] = getInitialCapTable(founderName)

    // First pass: calculate all funding rounds with manual valuations
    // and initialize reference-based rounds with temporary values
    const tempResults: Event[] = []

    for (const event of sortedEvents) {
      if (event.type === "funding") {
        const round = event as FundingRound

        let calculatedValuation: number
        let preMoneyValuation: number
        let postMoneyValuation: number

        if (round.valuationSource === "manual") {
          calculatedValuation = round.manualValuation
        } else {
          // For reference-based rounds, we'll calculate this in the second pass
          calculatedValuation = 0
        }

        // Calculate pre-money and post-money based on valuation type
        if (round.valuationType === "pre-money") {
          preMoneyValuation = calculatedValuation
          postMoneyValuation = preMoneyValuation + round.investmentAmount
        } else {
          postMoneyValuation = calculatedValuation
          preMoneyValuation = Math.max(0, postMoneyValuation - round.investmentAmount)
        }

        const tempRound: FundingRound = {
          ...round,
          calculatedValuation,
          preMoneyValuation,
          postMoneyValuation,
          capTable: [],
        }

        tempResults.push(tempRound)
      } else {
        tempResults.push({ ...event })
      }
    }

    // Second pass: resolve reference-based valuations
    // We need to do this iteratively until all references are resolved
    let maxIterations = 10 // Prevent infinite loops
    let hasUnresolvedReferences = true

    while (hasUnresolvedReferences && maxIterations > 0) {
      hasUnresolvedReferences = false
      maxIterations--

      for (let i = 0; i < tempResults.length; i++) {
        const event = tempResults[i]
        if (event.type === "funding") {
          const round = event as FundingRound

          if (round.valuationSource === "reference" && round.calculatedValuation === 0) {
            // Try to resolve this reference
            const referenceRound = tempResults.find(
              (e) => e.id === round.referenceRoundId && e.type === "funding",
            ) as FundingRound

            if (referenceRound && (referenceRound.preMoneyValuation > 0 || referenceRound.postMoneyValuation > 0)) {
              // Reference round has been calculated, we can now calculate this round
              let referenceValuation =
                round.valuationType === "pre-money"
                  ? referenceRound.preMoneyValuation
                  : referenceRound.postMoneyValuation

              if (referenceValuation > 0) {
                // Convert currency if needed
                referenceValuation = convertCurrency(referenceValuation, referenceRound.currency, round.currency)

                // Apply discount
                const discountMultiplier = (100 - round.discountPercentage) / 100
                const calculatedValuation = referenceValuation * discountMultiplier

                // Update the round with calculated valuation
                let preMoneyValuation: number
                let postMoneyValuation: number

                if (round.valuationType === "pre-money") {
                  preMoneyValuation = calculatedValuation
                  postMoneyValuation = preMoneyValuation + round.investmentAmount
                } else {
                  postMoneyValuation = calculatedValuation
                  preMoneyValuation = Math.max(0, postMoneyValuation - round.investmentAmount)
                }

                tempResults[i] = {
                  ...round,
                  calculatedValuation,
                  preMoneyValuation,
                  postMoneyValuation,
                  capTable: [],
                }
              }
            } else {
              // Reference not yet resolved
              hasUnresolvedReferences = true
            }
          }
        }
      }
    }

    // Third pass: calculate cap tables in order
    currentCapTable = getInitialCapTable(founderName)

    for (const event of tempResults) {
      if (event.type === "funding") {
        const round = event as FundingRound

        // Calculate cap table for this funding round
        const capTable = calculateCapTableForFundingRound(round, currentCapTable)

        const updatedRound: FundingRound = {
          ...round,
          capTable,
        }

        result.push(updatedRound)
        currentCapTable = capTable
      } else if (event.type === "option-pool") {
        const pool = event as OptionPool

        // Calculate option pool dilution
        const capTable = calculateCapTableForOptionPool(pool, currentCapTable)

        const updatedPool: OptionPool = {
          ...pool,
          capTable,
        }

        result.push(updatedPool)
        currentCapTable = capTable
      }
    }

    return result
  }

  const calculateCapTableForFundingRound = (round: FundingRound, previousCapTable: Shareholder[]): Shareholder[] => {
    if (round.postMoneyValuation <= 0 || round.investmentAmount <= 0) return previousCapTable

    // Calculate new investor ownership percentage
    const newInvestorPercentage = (round.investmentAmount / round.postMoneyValuation) * 100

    // Validate that the new investor percentage is reasonable
    if (newInvestorPercentage <= 0 || newInvestorPercentage >= 100) {
      return previousCapTable
    }

    // Calculate dilution factor for existing shareholders
    const dilutionFactor = (100 - newInvestorPercentage) / 100

    // Create new cap table
    const newCapTable: Shareholder[] = []

    // Add diluted existing shareholders
    previousCapTable.forEach((shareholder) => {
      const newPercentage = shareholder.percentage * dilutionFactor
      if (newPercentage > 0.01) {
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
      name: round.newInvestorName,
      shares: newInvestorShares,
      percentage: newInvestorPercentage,
    })

    return newCapTable
  }

  const calculateCapTableForOptionPool = (pool: OptionPool, previousCapTable: Shareholder[]): Shareholder[] => {
    const poolPercentage = pool.percentage
    if (poolPercentage <= 0 || poolPercentage >= 100) {
      return previousCapTable
    }

    // Dilute existing shareholders
    const dilutionFactor = (100 - poolPercentage) / 100
    const dilutedCapTable: Shareholder[] = previousCapTable.map((shareholder) => ({
      ...shareholder,
      shares: Math.round(shareholder.shares * dilutionFactor),
      percentage: shareholder.percentage * dilutionFactor,
    }))

    // Add option pool
    const optionPoolShares = Math.round((poolPercentage / 100) * 1000000)
    dilutedCapTable.push({
      name: pool.name,
      shares: optionPoolShares,
      percentage: poolPercentage,
    })

    return dilutedCapTable
  }

  const updateEvent = (model: "A" | "B", eventId: string, field: string, value: any) => {
    const events = model === "A" ? eventsA : eventsB
    const setEvents = model === "A" ? setEventsA : setEventsB
    const founderName = model === "A" ? founderNameA : founderNameB

    setEvents((prevEvents) => {
      const updatedEvents = prevEvents.map((event) => {
        if (event.id === eventId) {
          return { ...event, [field]: value }
        }
        return event
      })

      return recalculateAllEvents(updatedEvents, founderName)
    })
  }

  const removeEvent = (model: "A" | "B", eventId: string) => {
    const events = model === "A" ? eventsA : eventsB
    const setEvents = model === "A" ? setEventsA : setEventsB
    const founderName = model === "A" ? founderNameA : founderNameB

    setEvents((prevEvents) => {
      // Remove the event
      const filteredEvents = prevEvents.filter((event) => event.id !== eventId)

      // Clear any references to the deleted round in funding rounds
      const cleanedEvents = filteredEvents.map((event) => {
        if (event.type === "funding") {
          const round = event as FundingRound
          if (round.referenceRoundId === eventId) {
            return {
              ...round,
              referenceRoundId: "",
              valuationSource: "manual" as const,
            }
          }
        }
        return event
      })

      return recalculateAllEvents(cleanedEvents, founderName)
    })
  }

  const formatCurrency = (amount: number, currency: string) => {
    const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$"
    return `${symbol}${amount.toLocaleString()}`
  }

  const getInitialCapTable = (founderName: string): Shareholder[] => {
    return [{ name: founderName, shares: 1000000, percentage: 100 }]
  }

  // Get available rounds for reference (only future funding rounds to avoid cycles)
  const getAvailableReferenceRounds = (model: "A" | "B", currentEventId: string) => {
    const events = model === "A" ? eventsA : eventsB
    const currentEvent = events.find((e) => e.id === currentEventId)
    if (!currentEvent) return []

    return events
      .filter((e) => e.type === "funding" && e.order > currentEvent.order)
      .map((e) => e as FundingRound)
      .filter((r) => r.postMoneyValuation > 0)
  }

  // Generates the full, uncompressed JSON string for copy/paste
  const generateFullSaveString = (): string => {
    const state: SavedState = {
      comparisonMode,
      exchangeRates: primaryExchangeRates,
      modelA: {
        founderName: founderNameA,
        events: eventsA.map(({ capTable, ...event }) => event),
      },
      ...(comparisonMode && {
        modelB: {
          founderName: founderNameB,
          events: eventsB.map(({ capTable, ...event }) => event),
        },
      }),
    }
    return JSON.stringify(state, null, 2)
  }

  // Generates the compressed string for URL sharing
  const generateCompressedSaveString = (): string => {
    const state: SavedState = {
      comparisonMode,
      exchangeRates: primaryExchangeRates,
      modelA: {
        founderName: founderNameA,
        events: eventsA.map(({ capTable, ...event }) => event),
      },
      ...(comparisonMode && {
        modelB: {
          founderName: founderNameB,
          events: eventsB.map(({ capTable, ...event }) => event),
        },
      }),
    }
    return LZString.compressToEncodedURIComponent(JSON.stringify(state))
  }

  const loadState = (state: SavedState | any) => {
    // Handle new format
    if (state.modelA) {
      // Set exchange rates
      if (state.exchangeRates) {
        setPrimaryExchangeRates(state.exchangeRates)
      } else {
        setPrimaryExchangeRates(DEFAULT_PRIMARY_EXCHANGE_RATES)
      }

      // Set comparison mode
      setComparisonMode(!!state.comparisonMode)

      // Load model A
      setFounderNameA(state.modelA.founderName || "Founders")
      const eventsA = state.modelA.events.map((eventData: any) => ({
        ...eventData,
        capTable: [],
      }))
      setEventsA(recalculateAllEvents(eventsA, state.modelA.founderName || "Founders"))

      // Load model B if in comparison mode
      if (state.comparisonMode && state.modelB) {
        setFounderNameB(state.modelB.founderName || "Founders")
        const eventsB = state.modelB.events.map((eventData: any) => ({
          ...eventData,
          capTable: [],
        }))
        setEventsB(recalculateAllEvents(eventsB, state.modelB.founderName || "Founders"))
      } else {
        // Initialize model B with model A data
        setFounderNameB(state.modelA.founderName || "Founders")
        setEventsB(JSON.parse(JSON.stringify(eventsA)))
      }
    } else {
      // Handle legacy format (backward compatibility)
      if (state.exchangeRates) {
        setPrimaryExchangeRates(state.exchangeRates)
      } else {
        setPrimaryExchangeRates(DEFAULT_PRIMARY_EXCHANGE_RATES)
      }

      setComparisonMode(false)
      setFounderNameA(state.founderName || "Founders")

      // Load events (backwards compatibility)
      if (state.events) {
        const restoredEvents = state.events.map((eventData: any) => ({
          ...eventData,
          capTable: [],
        }))
        setEventsA(recalculateAllEvents(restoredEvents, state.founderName || "Founders"))
      } else {
        // Handle old format with separate rounds and optionPools
        const legacyState = state
        const restoredEvents: Event[] = []

        if (legacyState.rounds) {
          legacyState.rounds.forEach((roundData: any, index: number) => {
            restoredEvents.push({
              ...roundData,
              type: "funding",
              capTable: [],
              order: index * 2 + 1,
            })
          })
        }

        if (legacyState.optionPools) {
          legacyState.optionPools.forEach((poolData: any, index: number) => {
            restoredEvents.push({
              ...poolData,
              type: "option-pool",
              capTable: [],
              order: index * 2 + 2,
            })
          })
        }

        setEventsA(recalculateAllEvents(restoredEvents, state.founderName || "Founders"))
      }

      // Initialize model B with model A data
      setFounderNameB(state.founderName || "Founders")
      setEventsB(JSON.parse(JSON.stringify(eventsA)))
    }
  }

  const handleCopyState = () => {
    const stateString = generateFullSaveString()
    navigator.clipboard.writeText(stateString)
    setFeedbackMessage("Config copied to clipboard!")
    toast({
      title: "Copied!",
      description: "Configuration copied to clipboard",
    })
  }

  const handleLoadState = () => {
    try {
      let parsedState: SavedState | any
      try {
        parsedState = JSON.parse(saveString)
      } catch (jsonError) {
        const decompressedString = LZString.decompressFromBase64(saveString)
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
    const stateString = generateCompressedSaveString()
    const url = `${window.location.origin}${window.location.pathname}?state=${stateString}`
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

  // Sort events by order for display
  const sortedEventsA = [...eventsA].sort((a, b) => a.order - b.order)
  const sortedEventsB = [...eventsB].sort((a, b) => a.order - b.order)

  const renderCapTable = (
    capTable: Shareholder[],
    founderName: string,
    events: Event[],
    currentEventOrder?: number,
  ) => {
    // Determine which shareholders are part of "The Team" based on event types
    // The Team includes: founders + all option pools that have been created up to this point
    const optionPoolNames = new Set<string>()

    // Get all option pool names that should exist at this point in time
    if (currentEventOrder !== undefined) {
      events
        .filter((e) => e.type === "option-pool" && e.order <= currentEventOrder)
        .forEach((e) => optionPoolNames.add(e.name))
    } else {
      // If no current event order specified, include all option pools
      events.filter((e) => e.type === "option-pool").forEach((e) => optionPoolNames.add(e.name))
    }

    // Check if there are any option pools in the current cap table
    const hasOptionPools = capTable.some((shareholder) => optionPoolNames.has(shareholder.name))

    if (!hasOptionPools) {
      // No option pools, render normally but with blue border for founders
      return capTable.map((shareholder, index) => (
        <div
          key={index}
          className={`flex justify-between items-center py-1 px-2 bg-white rounded text-sm ${shareholder.name === founderName ? "border-l-4 border-l-blue-500" : ""}`}
        >
          <span className="font-medium text-gray-800">{shareholder.name}</span>
          <div className="text-right">
            <span className="font-semibold text-gray-900">{shareholder.percentage.toFixed(1)}%</span>
            <span className="text-xs text-gray-500 ml-2">{shareholder.shares.toLocaleString()}</span>
          </div>
        </div>
      ))
    }

    // Group founders and option pools as "The Team"
    const teamMembers = capTable.filter(
      (shareholder) => shareholder.name === founderName || optionPoolNames.has(shareholder.name),
    )
    const investors = capTable.filter(
      (shareholder) => shareholder.name !== founderName && !optionPoolNames.has(shareholder.name),
    )

    const teamTotalPercentage = teamMembers.reduce((sum, member) => sum + member.percentage, 0)
    const teamTotalShares = teamMembers.reduce((sum, member) => sum + member.shares, 0)

    return (
      <>
        {/* The Team (grouped) */}
        <div className="flex justify-between items-center py-1 px-2 bg-white rounded text-sm border-l-4 border-l-blue-500">
          <span className="font-medium text-gray-800">The Team</span>
          <div className="text-right">
            <span className="font-semibold text-gray-900">{teamTotalPercentage.toFixed(1)}%</span>
            <span className="text-xs text-gray-500 ml-2">{teamTotalShares.toLocaleString()}</span>
          </div>
        </div>

        {/* Team breakdown */}
        {teamMembers.map((member, index) => (
          <div
            key={`team-${index}`}
            className="flex justify-between items-center py-1 px-2 ml-4 bg-gray-50 rounded text-sm"
          >
            <span className="font-medium text-gray-700">└ {member.name}</span>
            <div className="text-right">
              <span className="font-semibold text-gray-800">{member.percentage.toFixed(1)}%</span>
              <span className="text-xs text-gray-500 ml-2">{member.shares.toLocaleString()}</span>
            </div>
          </div>
        ))}

        {/* Investors (individual entries) */}
        {investors.map((investor, index) => (
          <div
            key={`investor-${index}`}
            className="flex justify-between items-center py-1 px-2 bg-white rounded text-sm"
          >
            <span className="font-medium text-gray-800">{investor.name}</span>
            <div className="text-right">
              <span className="font-semibold text-gray-900">{investor.percentage.toFixed(1)}%</span>
              <span className="text-xs text-gray-500 ml-2">{investor.shares.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </>
    )
  }

  const InsertionPoint = ({
    model,
    afterOrder,
    isFirst = false,
  }: { model: "A" | "B"; afterOrder: number; isFirst?: boolean }) => {
    const insertionId = `insert-${afterOrder}-${model}`
    const activeInsertionPoint = model === "A" ? activeInsertionPointA : activeInsertionPointB
    const setActiveInsertionPoint = model === "A" ? setActiveInsertionPointA : setActiveInsertionPointB
    const isActive = activeInsertionPoint === insertionId

    return (
      <div className="flex justify-center -mt-3 mb-3">
        {!isActive ? (
          <button
            onClick={() => setActiveInsertionPoint(insertionId)}
            className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors duration-200 opacity-60 hover:opacity-100"
            title="Add event here"
          >
            <Plus className="h-4 w-4 text-gray-600" />
          </button>
        ) : (
          <div className="flex gap-2 p-2 bg-white rounded-lg shadow-sm border">
            <Button
              onClick={() => addRound(model, afterOrder)}
              size="sm"
              className="bg-gray-900 hover:bg-gray-700 text-white"
            >
              <Plus className="h-3 w-3 mr-1" />
              Funding Round
            </Button>
            <Button
              onClick={() => addOptionPool(model, afterOrder)}
              size="sm"
              variant="outline"
              className="border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white"
            >
              <Plus className="h-3 w-3 mr-1" />
              Option Pool
            </Button>
            <Button
              onClick={() => setActiveInsertionPoint(null)}
              size="sm"
              variant="ghost"
              className="text-gray-500 hover:text-gray-700"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    )
  }

  const renderModel = (model: "A" | "B") => {
    const events = model === "A" ? sortedEventsA : sortedEventsB
    const founderName = model === "A" ? founderNameA : founderNameB
    const setFounderName = model === "A" ? setFounderNameA : setFounderNameB

    return (
      <div className="space-y-6">
        {/* Model Title - only show in comparison mode */}
        {comparisonMode && (
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800">{model === "A" ? "Model A" : "Model B"}</h2>
          </div>
        )}

        {/* Initial Founders Section */}
        <Card className="bg-white border shadow-sm border-l-4 border-l-blue-500">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-gray-800 text-lg">🚀 Initial Ownership</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor={`founderName${model}`} className="text-sm text-gray-700">
                Founder/Team Name
              </Label>
              <Input
                id={`founderName${model}`}
                value={founderName}
                onChange={(e) => setFounderName(e.target.value)}
                placeholder="Enter founder or team name"
                className="mt-1 border-gray-300 focus:border-gray-500"
              />
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <h4 className="font-medium mb-3 text-sm text-gray-800">Cap Table</h4>
              <div className="space-y-1">{renderCapTable(getInitialCapTable(founderName), founderName, [], 0)}</div>
            </div>
          </CardContent>
        </Card>

        {/* Events (Funding Rounds and Option Pools) with insertion points */}
        {events.map((event, index) => {
          const eventCard =
            event.type === "funding" ? (
              <Card key={event.id} className="bg-white border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-gray-800 text-lg">
                    <span className="flex items-center gap-2">💰 {event.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEvent(model, event.id)}
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
                      <Label htmlFor={`round-name-${event.id}`} className="text-sm text-gray-700">
                        Round Name
                      </Label>
                      <Input
                        id={`round-name-${event.id}`}
                        value={event.name}
                        onChange={(e) => updateEvent(model, event.id, "name", e.target.value)}
                        className="mt-1 border-gray-300 focus:border-gray-500"
                      />
                    </div>

                    <div>
                      <Label htmlFor={`currency-${event.id}`} className="text-sm text-gray-700">
                        Currency
                      </Label>
                      <Select
                        value={event.currency}
                        onValueChange={(value) =>
                          updateEvent(model, event.id, "currency", value as "USD" | "GBP" | "EUR")
                        }
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
                      <Label htmlFor={`investment-${event.id}`} className="text-sm text-gray-700">
                        Investment Amount
                      </Label>
                      <Input
                        id={`investment-${event.id}`}
                        type="number"
                        value={event.investmentAmount || ""}
                        onChange={(e) => updateEvent(model, event.id, "investmentAmount", Number(e.target.value))}
                        placeholder="0"
                        className="mt-1 border-gray-300 focus:border-gray-500"
                      />
                    </div>

                    <div>
                      <Label htmlFor={`investor-name-${event.id}`} className="text-sm text-gray-700">
                        New Investor
                      </Label>
                      <Input
                        id={`investor-name-${event.id}`}
                        value={event.newInvestorName}
                        onChange={(e) => updateEvent(model, event.id, "newInvestorName", e.target.value)}
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
                        <Label htmlFor={`valuation-type-${event.id}`} className="text-sm text-gray-700">
                          Valuation Type
                        </Label>
                        <Select
                          value={event.valuationType}
                          onValueChange={(value) => updateEvent(model, event.id, "valuationType", value)}
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
                        <Label htmlFor={`valuation-source-${event.id}`} className="text-sm text-gray-700">
                          Valuation Source
                        </Label>
                        <Select
                          value={event.valuationSource}
                          onValueChange={(value) => updateEvent(model, event.id, "valuationSource", value)}
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
                    {event.valuationSource === "manual" ? (
                      <div>
                        <Label htmlFor={`manual-valuation-${event.id}`} className="text-sm text-gray-700">
                          {event.valuationType === "pre-money" ? "Pre-Money" : "Post-Money"} Valuation
                        </Label>
                        <Input
                          id={`manual-valuation-${event.id}`}
                          type="number"
                          value={event.manualValuation || ""}
                          onChange={(e) => updateEvent(model, event.id, "manualValuation", Number(e.target.value))}
                          placeholder="0"
                          className="mt-1 border-gray-300 focus:border-gray-500"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor={`reference-round-${event.id}`} className="text-sm text-gray-700">
                            Reference Round
                          </Label>
                          <Select
                            value={event.referenceRoundId}
                            onValueChange={(value) => updateEvent(model, event.id, "referenceRoundId", value)}
                          >
                            <SelectTrigger className="mt-1 border-gray-300 focus:border-gray-500">
                              <SelectValue placeholder="Select future round" />
                            </SelectTrigger>
                            <SelectContent>
                              {getAvailableReferenceRounds(model, event.id).map((refRound) => (
                                <SelectItem key={refRound.id} value={refRound.id}>
                                  {refRound.name} ({refRound.currency})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label htmlFor={`discount-${event.id}`} className="text-sm text-gray-700">
                            Discount %
                          </Label>
                          <Input
                            id={`discount-${event.id}`}
                            type="number"
                            value={event.discountPercentage || ""}
                            onChange={(e) => updateEvent(model, event.id, "discountPercentage", Number(e.target.value))}
                            placeholder="0"
                            min="0"
                            max="100"
                            className="mt-1 border-gray-300 focus:border-gray-500"
                          />
                        </div>
                      </div>
                    )}
                    {event.postMoneyValuation > 0 && (
                      <>
                        {/* Add separator line and financial summary */}
                        <div className="border-t border-gray-200 pt-3 mt-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1 text-sm text-gray-700">
                              <div className="flex justify-between">
                                <span>Pre-Money:</span>
                                <span className="font-semibold text-gray-900">
                                  {formatCurrency(event.preMoneyValuation, event.currency)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Investment:</span>
                                <span className="font-semibold text-gray-900">
                                  {formatCurrency(event.investmentAmount, event.currency)}
                                </span>
                              </div>
                              <div className="flex justify-between border-t pt-1 border-gray-200">
                                <span>Post-Money:</span>
                                <span className="font-semibold text-gray-900">
                                  {formatCurrency(event.postMoneyValuation, event.currency)}
                                </span>
                              </div>
                            </div>

                            {event.valuationSource === "reference" && event.referenceRoundId && (
                              <div className="text-xs text-gray-600 space-y-1">
                                <div>Source: {events.find((e) => e.id === event.referenceRoundId)?.name}</div>
                                {event.discountPercentage > 0 && <div>Discount: {event.discountPercentage}%</div>}
                                <div>Calculated: {formatCurrency(event.calculatedValuation, event.currency)}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  {event.postMoneyValuation > 0 && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <h4 className="font-medium mb-3 text-sm text-gray-800">Cap Table After {event.name}</h4>
                      <div className="space-y-1">
                        {renderCapTable(event.capTable, founderName, events, event.order)}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card key={event.id} className="bg-white border shadow-sm border-l-4 border-l-blue-500">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-gray-800 text-lg">
                    <span className="flex items-center gap-2">🎯 {event.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEvent(model, event.id)}
                      className="text-gray-600 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`pool-name-${event.id}`} className="text-sm text-gray-700">
                        Pool Name
                      </Label>
                      <Input
                        id={`pool-name-${event.id}`}
                        value={event.name}
                        onChange={(e) => updateEvent(model, event.id, "name", e.target.value)}
                        className="mt-1 border-gray-300 focus:border-gray-500"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`pool-percentage-${event.id}`} className="text-sm text-gray-700">
                        Pool Percentage
                      </Label>
                      <Input
                        id={`pool-percentage-${event.id}`}
                        type="number"
                        value={event.percentage || ""}
                        onChange={(e) => updateEvent(model, event.id, "percentage", Number(e.target.value))}
                        placeholder="10"
                        min="0"
                        max="100"
                        step="0.1"
                        className="mt-1 border-gray-300 focus:border-gray-500"
                      />
                    </div>
                  </div>

                  {event.percentage > 0 && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <h4 className="font-medium mb-3 text-sm text-gray-800">Cap Table After {event.name}</h4>
                      <div className="space-y-1">
                        {renderCapTable(event.capTable, founderName, events, event.order)}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )

          return (
            <React.Fragment key={event.id}>
              {/* Insertion point before first event */}
              {index === 0 && <InsertionPoint model={model} afterOrder={0} isFirst={true} />}
              {eventCard}
              {/* Insertion point after each event except the last */}
              {index < events.length - 1 && <InsertionPoint model={model} afterOrder={event.order} />}
            </React.Fragment>
          )
        })}

        {/* Add Round and Option Pool Buttons */}
        {events.length === 0 ? (
          <div className="text-center space-y-3">
            <div className="flex flex-wrap gap-3 justify-center">
              <Button onClick={() => addRound(model)} className="bg-gray-900 hover:bg-gray-700 text-white">
                <Plus className="h-4 w-4 mr-2" />
                Add Funding Round
              </Button>
              <Button
                onClick={() => addOptionPool(model)}
                variant="outline"
                className="border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white bg-transparent"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Option Pool
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-3">
            <div className="flex flex-wrap gap-3 justify-center">
              <Button onClick={() => addRound(model)} className="bg-gray-900 hover:bg-gray-700 text-white">
                <Plus className="h-4 w-4 mr-2" />
                Add Funding Round
              </Button>
              <Button
                onClick={() => addOptionPool(model)}
                variant="outline"
                className="border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white bg-transparent"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Option Pool
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-gray-900">Startup Equity Dilution Calculator</h1>
          <p className="text-gray-600">Model how ownership changes through funding rounds</p>
        </div>

        {/* New explanatory text */}
        <p className="text-center text-sm text-gray-700 bg-gray-100 p-3 rounded-lg shadow-sm">
          To use this tool, click "Add Funding Round" to add round, or adjust existing rounds (invest amount and
          valuation). You can save your current configuration by clicking "Copy Config" and pasting it somewhere safe,
          or generate a shareable URL with "Share URL" which embeds your configuration in the URL. If you make changes
          you need to generate a new URL. Nothing is stored server side, everything's emdedded in the URL.
        </p>

        {/* Compact Control Panel */}
        <Card className="bg-white border shadow-sm">
          <CardContent className="py-3">
            <div className="space-y-4">
              {/* First row: Save/Load Controls */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleCopyState} variant="outline" size="sm">
                    <Copy className="h-3 w-3 mr-1" />
                    Copy Config
                  </Button>
                  <Button onClick={() => setShowSaveDialog(!showSaveDialog)} variant="outline" size="sm">
                    <Upload className="h-3 w-3 mr-1" />
                    Load Config
                  </Button>
                  <Button onClick={handleShareURL} variant="outline" size="sm">
                    <Share className="h-3 w-3 mr-1" />
                    Share URL
                  </Button>
                </div>

                {/* Feedback Message - appears to the right of buttons */}
                {feedbackMessage && (
                  <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-full animate-pulse">
                    {feedbackMessage}
                  </span>
                )}
              </div>

              {/* Load Config Dialog (collapsible) */}
              {showSaveDialog && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <Label htmlFor="saveString" className="text-xs text-gray-600">
                    Paste Configuration String:
                  </Label>
                  <Textarea
                    id="saveString"
                    value={saveString}
                    onChange={(e) => setSaveString(e.target.value)}
                    placeholder="Paste your configuration string here..."
                    className="h-12 text-xs border-gray-300 focus:border-gray-500"
                  />
                  <Button onClick={handleLoadState} size="sm">
                    Apply Configuration
                  </Button>
                </div>
              )}

              {/* Second row: Exchange Rates */}
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-2 pt-2 border-t border-gray-100">
                <div className="flex-1">
                  <p className="text-xs text-gray-600">
                    <strong>Rates:</strong> 1 USD = {allExchangeRates["USD-GBP"]} GBP | 1 USD ={" "}
                    {allExchangeRates["USD-EUR"]} EUR
                    {showExchangeSettings && (
                      <span className="ml-2">
                        | 1 GBP = {allExchangeRates["GBP-USD"]} USD | 1 EUR = {allExchangeRates["EUR-USD"]} USD
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  onClick={() => setShowExchangeSettings(!showExchangeSettings)}
                  variant="ghost"
                  size="sm"
                  className="text-gray-500 hover:text-gray-700 px-2 py-1"
                >
                  <Settings className="h-3 w-3 mr-1" />
                  {showExchangeSettings ? "Hide" : "Edit"} Rates
                </Button>
              </div>

              {/* Exchange Rate Settings (collapsible) - appears below rates */}
              {showExchangeSettings && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                  <div>
                    <Label htmlFor="usd-gbp-rate" className="text-xs text-gray-600">
                      USD to GBP Rate
                    </Label>
                    <Input
                      id="usd-gbp-rate"
                      type="number"
                      step="0.0001"
                      value={primaryExchangeRates["USD-GBP"]}
                      onChange={(e) => updatePrimaryExchangeRate("USD-GBP", Number(e.target.value))}
                      className="mt-1 h-8 text-sm border-gray-300 focus:border-gray-500"
                    />
                  </div>
                  <div>
                    <Label htmlFor="usd-eur-rate" className="text-xs text-gray-600">
                      USD to EUR Rate
                    </Label>
                    <Input
                      id="usd-eur-rate"
                      type="number"
                      step="0.0001"
                      value={primaryExchangeRates["USD-EUR"]}
                      onChange={(e) => updatePrimaryExchangeRate("USD-EUR", Number(e.target.value))}
                      className="mt-1 h-8 text-sm border-gray-300 focus:border-gray-500"
                    />
                  </div>
                </div>
              )}

              {/* Third row: Comparison Mode Toggle */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 border-t border-gray-100">
                <div className="flex items-center space-x-2">
                  <SplitSquareVertical className="h-4 w-4 text-gray-700" />
                  <Label htmlFor="comparison-mode" className="text-sm font-medium text-gray-700">
                    Compare Models
                  </Label>
                  <Switch
                    id="comparison-mode"
                    checked={comparisonMode}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        enableComparisonMode()
                      } else {
                        disableComparisonMode()
                      }
                    }}
                  />
                </div>

                {comparisonMode && (
                  <div className="flex gap-1">
                    <Button
                      onClick={copyModelAToB}
                      size="sm"
                      variant="outline"
                      className="text-xs px-2 py-1 bg-transparent"
                    >
                      A→B
                    </Button>
                    <Button
                      onClick={copyModelBToA}
                      size="sm"
                      variant="outline"
                      className="text-xs px-2 py-1 bg-transparent"
                    >
                      B→A
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Models */}
        {comparisonMode ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">{renderModel("A")}</div>
            <div className="space-y-6">{renderModel("B")}</div>
          </div>
        ) : (
          renderModel("A")
        )}

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
            All code is running client side. If you want any features added, feel free to get in touch.
          </p>
        </footer>
      </div>
    </div>
  )
}
