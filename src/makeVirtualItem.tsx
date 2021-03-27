import React, {
    useMemo,
    useEffect,
    useLayoutEffect,


    useContext
} from 'react';
import { ReadaptContext, SIZE_CATEGORY_BEING_CALCULATED, MAX_DYNAMIC_CALCULATION_PER_BATCH } from './index';

export function makeVirtualItem<T>(
    Component: React.ComponentType<T & VirtualItemProps>,
    staticDataGetter: (props: T) => VirtualItemStaticData
): React.ComponentType<T> {
    return (props: T) => {
        const { readaptState, renderPassState } = useContext(ReadaptContext);

        if (!readaptState || !renderPassState) {
            return <Component {...props} readapt={null} />;
        }

        const staticData = staticDataGetter(props);
        const { id, sizeCategory = null } = staticData;
        let { size = null } = staticData;

        const isDynamicSize = !size;

        if (sizeCategory) {
            if (size) {
                console.warn(
                    'Readapt: sizeCategory and size are both provided, sizeCategory will be used and the height will be dynamically calculated.'
                );
            }

            readaptState.current.sizes[id] = sizeCategory;

            const sharedSize = readaptState.current.sizeCategoryValues[sizeCategory];
            if (!sharedSize &&
                readaptState.current.sizeCategoryValues[sizeCategory] !==
                SIZE_CATEGORY_BEING_CALCULATED) {
                readaptState.current.sizeCategoryValues[sizeCategory] = SIZE_CATEGORY_BEING_CALCULATED;
            } else {
                renderPassState.current.invalidatedIDs.delete(id);
                size = sharedSize;
            }
        } else if (size) {
            readaptState.current.sizes[id] = size;
        } else {
            size = readaptState.current.sizes[id] as number;
        }

        const orderIndex = renderPassState.current.order.push(id) - 1;

        useLayoutEffect(() => {
            if (!renderPassState.current?.invalidated &&
                renderPassState.current?.previousRenderPassState &&
                renderPassState.current.previousRenderPassState.order.indexOf(
                    id
                ) !== orderIndex) {
                // Invalidated flag may not be enough, this component may be re-rendering due to conntectedProps or the parent changing
                // TODO add active flag to renderPass to potentially avoid useLayoutEffect here (invalidated is more correct when possible)
                // renderPassState.current.invalidated = true;
                readaptState.current.flipRenderBit();
            }
        });
        useEffect(() => () => {
            // cleanup on unmount
            renderPassState.current.dynamicSizeIDs.delete(id);
            renderPassState.current.invalidatedIDs.delete(id);
        });

        const {
            sizes,
            viewHeight,
            scrollTop,
            deoptimizations,
        } = readaptState.current;

        const itemIsInvalidated = renderPassState.current.invalidatedIDs.has(
            id
        );

        const { y, isDataOnlyRender } = useMemo(() => {
            let { y, isDataOnlyRender } = renderPassState.current;

            renderPassState.current.invalidatedIDs.delete(id);

            if (!renderPassState.current.isDataOnlyRender &&
                size &&
                size > 0 &&
                (y + size < scrollTop || y > viewHeight + scrollTop)) {
                // itemContainerPool.release(id);
                isDataOnlyRender = true;
            }

            if (!size ||
                (sizeCategory && size === SIZE_CATEGORY_BEING_CALCULATED)) {
                y = -5000;

                if (renderPassState.current.dynamicSizeReadyForCalculation <
                    MAX_DYNAMIC_CALCULATION_PER_BATCH) {
                    renderPassState.current.dynamicSizeReadyForCalculation++;
                    isDataOnlyRender = false;
                } else {
                    isDataOnlyRender = true;
                    // without a sizeCategory there is no need to invalidate an id as its size will cause it to recalculate if needed
                    if (!sizeCategory)
                        renderPassState.current.invalidatedIDs.add(id);
                }
            }

            // item is in view and requires size calculation
            if (!isDataOnlyRender && (isDynamicSize || sizeCategory)) {
                renderPassState.current.dynamicSizeIDs.add(id);
            }

            return { y, isDataOnlyRender };
        }, [
            viewHeight,
            scrollTop,
            size,
            sizes,
            itemIsInvalidated,
            renderPassState.current.renderBit,
        ]);

        if (size && size > 0)
            renderPassState.current.y += size;

        const virtualItemProps = useMemo(
            () => ({
                y,
                style: {
                    transform: `translateY(${y}px)`,
                    position: 'absolute',
                    top: '0',
                },
                isDataOnlyRender,
                invalidateSize: () => {
                    if (deoptimizations.itemsOutsideViewportCanChangeSize) {
                        // TODO: clear dynamic size if appropriate
                        if (isDynamicSize) {
                            renderPassState.current.invalidatedIDs.add(id);
                            renderPassState.current.dynamicSizeIDs.add(id);
                        }
                    }
                    readaptState.current.flipRenderBit(true);
                },
            }),
            [y, isDataOnlyRender]
        );

        const componentNeedsUpdate = deoptimizations.overzealousInvalidation || !isDataOnlyRender
            ? renderPassState.current.renderBit
            : true;

        return useMemo(() => {
            const result = (
                <Component
                    {...props}
                    key={`readapt-item-${id}`}
                    readapt={virtualItemProps} />
            );

            return result;
        }, [id, y, props, componentNeedsUpdate, itemIsInvalidated]);
    };
}
