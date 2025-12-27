//go:build !release

package main

import "github.com/wailsapp/wails/v2/pkg/options"

var (
	appFrameless        = false
	appWindowStartState = options.Maximised
)
