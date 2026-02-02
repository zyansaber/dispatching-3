import React, { useEffect, useState } from "react";
import { DispatchStats, DispatchTable } from "@/components/DataTables";
import { useDashboardContext } from "./Index";

const DispatchPage: React.FC = () => {
  const {
    dispatchProcessed,
    deliveryToAssignments,
    stats,
    transportCompanies,
    transportPreferences,
    sidebarFilter,
  } = useDashboardContext();
  const [activeFilter, setActiveFilter] = useState<
    "all" | "wrongStatus" | "noReference" | "snowy" | "canBeDispatched" | "onHold" | "booked" | "temporaryLeaving" | "invalidStock" | "serviceTicket"
  >(
    "all"
  );

  useEffect(() => {
    if (sidebarFilter?.kind === "grRange") {
      setActiveFilter("canBeDispatched");
    }
  }, [sidebarFilter]);

  return (
    <div className="space-y-6">
      <DispatchStats
        wrongStatus={stats.wrongStatus}
        noReference={stats.noReference}
        snowyStock={stats.snowyStock}
        waitingForBooking={stats.waitingForBooking}
        canBeDispatched={stats.canBeDispatched}
        onHold={stats.onHold}
        booked={stats.booked}
        temporaryLeavingWithoutPGI={stats.temporaryLeavingWithoutPGI}
        invalidStock={stats.invalidStock}
        serviceTicket={stats.serviceTicket}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />

      <DispatchTable
        allData={dispatchProcessed}
        activeFilter={activeFilter}
        transportCompanies={transportCompanies}
        transportPreferences={transportPreferences}
        deliveryToAssignments={deliveryToAssignments}
        grRangeFilter={sidebarFilter?.kind === "grRange" ? sidebarFilter : null}
      />
    </div>
  );
};

export default DispatchPage;
